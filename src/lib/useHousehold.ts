import { useCallback, useEffect, useState } from 'react';
import { supabase } from './supabase';
import type { Budget, Category, Expense, Household, Invitation, Member, Settlement } from './types';

export interface HouseholdData {
  household: Household;
  members: Member[];
  invitation: Invitation | null;
  categories: Category[];
  expenses: Expense[];
  settlements: Settlement[];
  budgets: Budget[];
}

export type LoadState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'no-household'; invitation: Invitation | null }
  | { status: 'ready'; data: HouseholdData };

const REALTIME_TABLES = ['households', 'members', 'invitations', 'categories', 'expenses', 'settlements', 'budgets'];

async function load(userId: string): Promise<LoadState> {
  const me = await supabase.from('members').select('*').eq('user_id', userId).maybeSingle();
  if (me.error) throw me.error;
  if (!me.data) {
    // Sin espacio todavía: ¿hay una invitación para mi email?
    const inv = await supabase.from('invitations').select('*').maybeSingle();
    if (inv.error) throw inv.error;
    return { status: 'no-household', invitation: inv.data };
  }
  const h = me.data.household_id as string;
  const [household, members, invitation, categories, expenses, settlements, budgets] = await Promise.all([
    supabase.from('households').select('*').eq('id', h).single(),
    supabase.from('members').select('*').eq('household_id', h).order('joined_at'),
    supabase.from('invitations').select('*').eq('household_id', h).maybeSingle(),
    supabase.from('categories').select('*').eq('household_id', h).order('name'),
    supabase.from('expenses').select('*').eq('household_id', h).order('spent_on', { ascending: false }).order('created_at', { ascending: false }),
    supabase.from('settlements').select('*').eq('household_id', h).order('paid_on', { ascending: false }).order('created_at', { ascending: false }),
    supabase.from('budgets').select('*').eq('household_id', h),
  ]);
  for (const r of [household, members, invitation, categories, expenses, settlements, budgets]) {
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
    },
  };
}

/** Carga todo el espacio compartido. Se recarga tras cada cambio y al volver a la pestaña. */
export function useHousehold(userId: string) {
  const [state, setState] = useState<LoadState>({ status: 'loading' });

  const reload = useCallback(async () => {
    try {
      setState(await load(userId));
    } catch (err) {
      setState({ status: 'error', message: err instanceof Error ? err.message : String((err as { message?: string })?.message ?? err) });
    }
  }, [userId]);

  useEffect(() => {
    void reload();
    const onVisible = () => {
      if (document.visibilityState === 'visible') void reload();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
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
    for (const table of ['expenses', 'settlements', 'budgets', 'categories', 'members']) {
      channel.on('postgres_changes', { event: 'DELETE', schema: 'public', table }, schedule);
    }
    channel.subscribe();
    return () => {
      clearTimeout(timer);
      void supabase.removeChannel(channel);
    };
  }, [householdId, reload]);

  return { state, reload };
}
