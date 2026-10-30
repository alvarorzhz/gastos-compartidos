import { useCallback, useEffect, useState } from 'react';
import { today } from './dates';
import { flushQueued } from './expenseOutbox';
import { notifyNewExpenses } from './push';
import { reportError } from './errorLog';
import { errorMessage, supabase } from './supabase';
import type { Budget, Category, Challenge, TripEvent, Expense, ExpenseReaction, Household, Invitation, Member, PersonalBudget, PersonalEntry, PersonalRecurring, RecurringExpense, SavingsContribution, SavingsGoal, Settlement } from './types';

export interface HouseholdData {
  household: Household;
  members: Member[];
  invitation: Invitation | null;
  categories: Category[];
  expenses: Expense[];
  settlements: Settlement[];
  budgets: Budget[];
  recurring: RecurringExpense[];
  /** Solo los movimientos personales de quien usa la app. */
  personal: PersonalEntry[];
  personalRecurring: PersonalRecurring[];
  /** Límites del presupuesto personal (vacío hasta ejecutar la migración 0011). */
  personalBudgets: PersonalBudget[];
  goals: SavingsGoal[];
  contributions: SavingsContribution[];
  events: TripEvent[];
  /** Reacciones a los gastos (vacío hasta ejecutar la migración 0013). */
  reactions: ExpenseReaction[];
  /** Retos de pareja (vacío hasta ejecutar la migración 0016). */
  challenges: Challenge[];
}

export type LoadState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'no-household'; invitation: Invitation | null }
  /** stale: la última actualización falló (sin conexión); se siguen mostrando los datos que había. */
  | { status: 'ready'; data: HouseholdData; stale?: boolean };

const REALTIME_TABLES = ['households', 'members', 'invitations', 'categories', 'expenses', 'settlements', 'budgets', 'recurring_expenses', 'savings_goals', 'savings_contributions', 'events', 'expense_reactions', 'challenges'];

/** Filas por petición: Supabase no devuelve más de 1000 de una vez. */
const PAGE = 1000;

/**
 * Lee todas las filas de una consulta, de 1000 en 1000, para que no se pierdan las más
 * antiguas cuando haya muchas. La consulta debe tener un orden estable.
 */
async function fetchAll<T>(
  query: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>,
): Promise<{ data: T[]; error: unknown }> {
  const all: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await query(from, from + PAGE - 1);
    if (error) return { data: all, error };
    all.push(...(data ?? []));
    if (!data || data.length < PAGE) return { data: all, error: null };
  }
}

/*
 * Copia de los últimos datos en el móvil, para poder abrir la app sin conexión (se ven los
 * datos de la última vez y se pueden apuntar gastos, que se suben al volver la conexión).
 */
const SNAPSHOT_KEY = 'gastos.copiaDatos';

function saveSnapshot(userId: string, data: HouseholdData) {
  try {
    localStorage.setItem(SNAPSHOT_KEY, JSON.stringify({ userId, data }));
  } catch {
    // Sin espacio o sin almacenamiento: sin copia, la app necesitará conexión al abrirse.
  }
}

function readSnapshot(userId: string): HouseholdData | null {
  try {
    const saved = JSON.parse(localStorage.getItem(SNAPSHOT_KEY) ?? 'null') as { userId: string; data: HouseholdData } | null;
    if (saved?.userId !== userId || !saved.data?.household) return null;
    return { ...saved.data, events: saved.data.events ?? [], reactions: saved.data.reactions ?? [], challenges: saved.data.challenges ?? [] };
  } catch {
    return null;
  }
}

/** Al cerrar sesión no se deja en el móvil la copia de los datos. */
export function forgetSnapshot() {
  try {
    localStorage.removeItem(SNAPSHOT_KEY);
  } catch {
    // Nada que borrar.
  }
}

async function load(userId: string): Promise<LoadState> {
  // Sin conexión no se espera a los reintentos: se enseña enseguida la copia del móvil.
  if (typeof navigator !== 'undefined' && navigator.onLine === false) throw new Error('Failed to fetch');
  // Primero sube lo que se apuntó sin conexión, y avisa a la pareja.
  const sent = await flushQueued(userId).catch(() => [] as string[]);
  notifyNewExpenses(sent);
  const me = await supabase.from('members').select('*').eq('user_id', userId).maybeSingle();
  if (me.error) throw me.error;
  if (!me.data) {
    // Sin espacio todavía: ¿hay una invitación para mi email?
    const inv = await supabase.from('invitations').select('*').maybeSingle();
    if (inv.error) throw inv.error;
    return { status: 'no-household', invitation: inv.data };
  }
  const h = me.data.household_id as string;
  // Antes de leer, apunta los gastos fijos que ya tocan (no hace nada si no hay ninguno pendiente).
  const [generated, generatedPersonal] = await Promise.all([
    supabase.rpc('generate_recurring_expenses', { p_today: today() }),
    supabase.rpc('generate_personal_recurring', { p_today: today() }),
  ]);
  if (generated.error) throw generated.error;
  if (generatedPersonal.error) throw generatedPersonal.error;
  const [household, members, invitation, categories, expenses, settlements, budgets, recurring, personal, personalRecurring, goals, contributions, events, personalBudgets, reactions, challenges] = await Promise.all([
    supabase.from('households').select('*').eq('id', h).single(),
    supabase.from('members').select('*').eq('household_id', h).order('joined_at'),
    supabase.from('invitations').select('*').eq('household_id', h).maybeSingle(),
    supabase.from('categories').select('*').eq('household_id', h).order('name'),
    fetchAll<Expense>((a, b) => supabase.from('expenses').select('*').eq('household_id', h).order('spent_on', { ascending: false }).order('created_at', { ascending: false }).order('id').range(a, b)),
    fetchAll<Settlement>((a, b) => supabase.from('settlements').select('*').eq('household_id', h).order('paid_on', { ascending: false }).order('created_at', { ascending: false }).order('id').range(a, b)),
    fetchAll<Budget>((a, b) => supabase.from('budgets').select('*').eq('household_id', h).order('month').order('category_id').range(a, b)),
    supabase.from('recurring_expenses').select('*').eq('household_id', h).order('created_at'),
    fetchAll<PersonalEntry>((a, b) => supabase.from('personal_entries').select('*').eq('user_id', userId).order('entry_on', { ascending: false }).order('created_at', { ascending: false }).order('id').range(a, b)),
    supabase.from('personal_recurring').select('*').eq('user_id', userId).order('created_at'),
    supabase.from('savings_goals').select('*').eq('household_id', h).order('created_at'),
    fetchAll<SavingsContribution>((a, b) => supabase.from('savings_contributions').select('*').eq('household_id', h).order('contributed_on', { ascending: false }).order('created_at', { ascending: false }).order('id').range(a, b)),
    supabase.from('events').select('*').eq('household_id', h).order('created_at', { ascending: false }),
    supabase.from('personal_budgets').select('*').eq('user_id', userId).order('category'),
    fetchAll<ExpenseReaction>((a, b) => supabase.from('expense_reactions').select('*').eq('household_id', h).order('created_at').order('expense_id').order('user_id').range(a, b)),
    supabase.from('challenges').select('*').eq('household_id', h).order('created_at', { ascending: false }).limit(200),
  ]);
  for (const r of [household, members, invitation, categories, expenses, settlements, budgets, recurring, personal, personalRecurring, goals, contributions]) {
    if (r.error) throw r.error;
  }
  return {
    status: 'ready',
    data: {
      household: household.data,
      members: members.data ?? [],
      invitation: invitation.data,
      categories: categories.data ?? [],
      expenses: expenses.data ?? [],
      settlements: settlements.data ?? [],
      budgets: budgets.data ?? [],
      recurring: recurring.data ?? [],
      personal: personal.data ?? [],
      personalRecurring: personalRecurring.data ?? [],
      goals: goals.data ?? [],
      contributions: contributions.data ?? [],
      // Si aún no se ha ejecutado la migración de viajes, la app sigue funcionando sin ellos.
      events: events.error ? [] : events.data ?? [],
      // Igual con el presupuesto personal: sin la migración 0011 no hay límites.
      personalBudgets: personalBudgets.error ? [] : personalBudgets.data ?? [],
      // Y con las reacciones: sin la migración 0013 los gastos salen sin ellas.
      reactions: reactions.error ? [] : reactions.data,
      // Y con los retos: sin la migración 0016 no hay retos.
      challenges: challenges.error ? [] : challenges.data ?? [],
    },
  };
}

/** Carga todo el espacio compartido. Se recarga tras cada cambio y al volver a la pestaña. */
export function useHousehold(userId: string) {
  const [state, setState] = useState<LoadState>({ status: 'loading' });

  const reload = useCallback(async () => {
    try {
      const next = await load(userId);
      if (next.status === 'ready') saveSnapshot(userId, next.data);
      setState(next);
    } catch (err) {
      reportError(err, 'cargar los datos');
      const message = errorMessage(err);
      // Si ya había datos (p. ej. al volver a la app sin cobertura), se quedan en pantalla
      // para no perder lo que se estuviera escribiendo; solo se avisa. Si la app se abre sin
      // conexión, se enseña la copia de la última vez.
      setState((prev) => {
        if (prev.status === 'ready') return { ...prev, stale: true };
        const copy = readSnapshot(userId);
        return copy ? { status: 'ready', data: copy, stale: true } : { status: 'error', message };
      });
    }
  }, [userId]);

  useEffect(() => {
    void reload();
    const onVisible = () => {
      if (document.visibilityState === 'visible') void reload();
    };
    const onOnline = () => void reload();
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('online', onOnline);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('online', onOnline);
    };
  }, [reload]);

  // Tiempo real: cuando la otra persona cambia algo, se recarga todo (con un pequeño margen
  // para agrupar varios cambios seguidos). RLS decide qué eventos llegan.
  const householdId = state.status === 'ready' ? state.data.household.id : null;
  useEffect(() => {
    if (!householdId) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const schedule = () => {
      clearTimeout(timer);
      timer = setTimeout(() => void reload(), 400);
    };
    const channel = supabase.channel(`hogar-${householdId}`);
    for (const table of REALTIME_TABLES) {
      channel.on('postgres_changes', { event: '*', schema: 'public', table, filter: `${table === 'households' ? 'id' : 'household_id'}=eq.${householdId}` }, schedule);
    }
    // Los borrados no se pueden filtrar por hogar (solo traen el id de la fila), así que se
    // escuchan aparte; como mucho provocan una recarga de más.
    for (const table of ['expenses', 'settlements', 'budgets', 'categories', 'members', 'recurring_expenses', 'personal_entries', 'savings_goals', 'savings_contributions', 'personal_recurring', 'events', 'personal_budgets']) {
      channel.on('postgres_changes', { event: 'DELETE', schema: 'public', table }, schedule);
    }
    // Lo personal solo llega a la propia cuenta (RLS), por si se usa en dos dispositivos.
    for (const table of ['personal_entries', 'personal_recurring', 'personal_budgets']) {
      channel.on('postgres_changes', { event: '*', schema: 'public', table, filter: `user_id=eq.${userId}` }, schedule);
    }
    channel.subscribe();
    return () => {
      clearTimeout(timer);
      void supabase.removeChannel(channel);
    };
  }, [householdId, reload, userId]);

  return { state, reload };
}
