import { monthlySummary, totals } from './budget';
import { addMonths, monthOf } from './dates';
import { formatEuros } from './money';
import type { Budget, Category, Expense, ExpenseReaction, Member, PersonColor, SavingsContribution, SavingsGoal, Settlement } from './types';

/*
 * Lo que hace que la app se sienta de los dos: el color y el emoji de cada uno, las reacciones
 * a los gastos, lo último que ha hecho la pareja y las rachas de meses dentro del presupuesto.
 */

export const PERSON_COLORS: { value: PersonColor; label: string }[] = [
  { value: 'teal', label: 'Verde azulado' },
  { value: 'violet', label: 'Violeta' },
  { value: 'coral', label: 'Coral' },
  { value: 'blue', label: 'Azul' },
  { value: 'amber', label: 'Ámbar' },
  { value: 'pink', label: 'Rosa' },
  { value: 'green', label: 'Verde' },
  { value: 'slate', label: 'Gris' },
];

/** Emojis para usar en vez de la inicial. */
export const AVATAR_EMOJIS = ['🦊', '🐻', '🐼', '🐨', '🐯', '🦁', '🐸', '🐙', '🦄', '🐝', '🌻', '🌵', '🍕', '☕', '🎸', '⚽'];

/** Reacciones rápidas a un gasto. */
export const REACTION_EMOJIS = ['❤️', '😋', '😂', '🙈', '😱', '👏'];

/** Color de cada persona: el que eligió, o el de siempre (el primero verde azulado, el segundo violeta). */
export function personColor(members: Member[], userId: string): PersonColor | 'none' {
  const i = members.findIndex((m) => m.user_id === userId);
  if (i < 0) return 'none';
  return members[i].color ?? (i % 2 === 0 ? 'teal' : 'violet');
}

/** "Buenos días" hasta las 14, "Buenas tardes" hasta las 21 y "Buenas noches" el resto. */
export function greeting(now: Date): string {
  const h = now.getHours();
  if (h >= 6 && h < 14) return 'Buenos días';
  if (h >= 14 && h < 21) return 'Buenas tardes';
  return 'Buenas noches';
}

/** "hace un momento", "hace 5 min", "hace 2 horas", "ayer", "hace 3 días". */
export function timeAgo(iso: string, now: Date): string {
  const minutes = Math.floor((now.getTime() - new Date(iso).getTime()) / 60000);
  if (minutes < 1) return 'hace un momento';
  if (minutes < 60) return `hace ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return hours === 1 ? 'hace 1 hora' : `hace ${hours} horas`;
  const days = Math.floor(hours / 24);
  return days === 1 ? 'ayer' : `hace ${days} días`;
}

export interface Activity {
  at: string;
  /** Lo que hizo, sin el nombre: "apuntó Mercadona · 64,20 €". */
  text: string;
  /** Gasto al que se refiere, si lo hay (para reaccionar desde Inicio). */
  expenseId: string | null;
}

/** Solo se enseña lo de la última semana. */
const ACTIVITY_DAYS = 7;

/** Lo último que ha hecho la pareja en la app: un gasto, una reacción, un pago o una aportación a una hucha. */
export function partnerActivity(
  data: { expenses: Expense[]; reactions: ExpenseReaction[]; settlements: Settlement[]; contributions: SavingsContribution[]; goals: SavingsGoal[]; categories: Category[] },
  partnerId: string,
  now: Date,
): Activity | null {
  const titleOf = (e: Expense | undefined) => e?.note || data.categories.find((c) => c.id === e?.category_id)?.name || 'un gasto';
  const options: Activity[] = [];
  for (const e of data.expenses) {
    if (e.created_by === partnerId) options.push({ at: e.created_at, text: `apuntó ${titleOf(e)} · ${formatEuros(e.amount_cents)}`, expenseId: e.id });
  }
  for (const r of data.reactions) {
    if (r.user_id !== partnerId) continue;
    const e = data.expenses.find((x) => x.id === r.expense_id);
    if (!e) continue;
    const text = r.comment ? `comentó en ${titleOf(e)}: «${r.comment}»` : `reaccionó ${r.emoji} a ${titleOf(e)}`;
    options.push({ at: r.updated_at, text, expenseId: e.id });
  }
  for (const s of data.settlements) {
    if (s.created_by === partnerId) options.push({ at: s.created_at, text: `anotó un pago de ${formatEuros(s.amount_cents)}`, expenseId: null });
  }
  for (const c of data.contributions) {
    if (c.user_id !== partnerId || c.amount_cents <= 0) continue;
    const goal = data.goals.find((g) => g.id === c.goal_id);
    options.push({ at: c.created_at, text: `puso ${formatEuros(c.amount_cents)} en ${goal ? `la hucha «${goal.name}»` : 'una hucha'}`, expenseId: null });
  }
  const since = now.getTime() - ACTIVITY_DAYS * 24 * 3600 * 1000;
  const latest = options
    .filter((a) => new Date(a.at).getTime() >= since)
    .sort((a, b) => b.at.localeCompare(a.at))[0];
  return latest ?? null;
}

/**
 * Meses seguidos, hasta el anterior al de hoy, en los que lo gastado en categorías con
 * presupuesto no pasó del presupuesto. Un mes sin presupuesto corta la racha.
 */
export function budgetStreak(todayIso: string, categories: Category[], expenses: Expense[], budgets: Budget[]): number {
  let streak = 0;
  let month = addMonths(monthOf(todayIso), -1);
  const first = expenses.reduce((min, e) => (e.spent_on < min ? e.spent_on : min), todayIso);
  while (month >= monthOf(first) && streak < 120) {
    const sum = totals(monthlySummary(month, categories, expenses, budgets));
    if (sum.budgetCents <= 0 || sum.budgetedSpentCents > sum.budgetCents) break;
    streak++;
    month = addMonths(month, -1);
  }
  return streak;
}

/** Reacciones de un gasto: primero la de la pareja, luego la tuya. */
export function reactionsOf(reactions: ExpenseReaction[], expenseId: string, me: string): ExpenseReaction[] {
  return reactions.filter((r) => r.expense_id === expenseId).sort((a, b) => Number(a.user_id === me) - Number(b.user_id === me));
}
