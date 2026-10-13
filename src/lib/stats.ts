import { addMonths, monthOf } from './dates';
import type { Budget, Expense } from './types';

export interface MonthTotal {
  month: string; // YYYY-MM-01
  spentCents: number;
  budgetCents: number | null;
}

/** Gasto (y presupuesto, si hay) de los últimos `count` meses hasta `lastMonth`, del más antiguo al más reciente. */
export function monthlyTotals(
  expenses: Expense[],
  budgets: Budget[],
  lastMonth: string,
  count: number,
  categoryId = '',
): MonthTotal[] {
  const months = Array.from({ length: count }, (_, i) => addMonths(lastMonth, i - count + 1));
  const spent = new Map<string, number>();
  for (const e of expenses) {
    if (categoryId && e.category_id !== categoryId) continue;
    const m = monthOf(e.spent_on);
    spent.set(m, (spent.get(m) ?? 0) + e.amount_cents);
  }
  const budgeted = new Map<string, number>();
  for (const b of budgets) {
    if (categoryId && b.category_id !== categoryId) continue;
    budgeted.set(b.month, (budgeted.get(b.month) ?? 0) + b.amount_cents);
  }
  return months.map((month) => ({ month, spentCents: spent.get(month) ?? 0, budgetCents: budgeted.get(month) ?? null }));
}

export interface Slice {
  id: string;
  cents: number;
  share: number; // 0..1
}

/** Reparte el gasto de un mes (o de todos, con month = '') por una clave, de mayor a menor. */
export function breakdown(expenses: Expense[], month: string, key: (e: Expense) => string): Slice[] {
  const sums = new Map<string, number>();
  let total = 0;
  for (const e of expenses) {
    if (month && monthOf(e.spent_on) !== month) continue;
    const k = key(e);
    sums.set(k, (sums.get(k) ?? 0) + e.amount_cents);
    total += e.amount_cents;
  }
  return [...sums.entries()]
    .map(([id, cents]) => ({ id, cents, share: total ? cents / total : 0 }))
    .sort((a, b) => b.cents - a.cents);
}

/** Media mensual de los meses con algún gasto (para no hundir la media con meses vacíos al empezar). */
export function averageOfActive(totals: MonthTotal[]): number {
  const active = totals.filter((t) => t.spentCents > 0);
  return active.length ? active.reduce((s, t) => s + t.spentCents, 0) / active.length : 0;
}
