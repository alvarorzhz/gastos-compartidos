import { balanceFor, roundBalance } from './balance';
import { monthlySummary, totals } from './budget';
import { addMonths } from './dates';
import { breakdown } from './stats';
import type { HouseholdData } from './useHousehold';

export interface CategoryChange {
  categoryId: string;
  name: string;
  cents: number;
  previousCents: number;
}

export interface MonthClose {
  month: string;
  spentCents: number;
  budgetCents: number;
  /** Lo gastado en categorías con presupuesto (lo que se compara con él). */
  budgetedSpentCents: number;
  /** Gasto del mes anterior a este, para comparar. */
  previousSpentCents: number;
  /** Categorías del mes, de más a menos gasto, con lo del mes anterior. */
  categories: CategoryChange[];
  /** Categorías que se pasaron de su presupuesto. */
  overBudget: { name: string; overCents: number }[];
  paidBy: { userId: string; cents: number }[];
  /** Saldo pendiente hoy desde el punto de vista de `me` (positivo = te deben). */
  balanceCents: number;
}

export function monthClose(data: HouseholdData, me: string, month: string): MonthClose {
  const previous = addMonths(month, -1);
  const rows = monthlySummary(month, data.categories, data.expenses, data.budgets);
  const prevRows = new Map(monthlySummary(previous, data.categories, data.expenses, data.budgets).map((r) => [r.category.id, r.spentCents]));
  const sum = totals(rows);
  return {
    month,
    spentCents: sum.spentCents,
    budgetCents: sum.budgetCents,
    budgetedSpentCents: sum.budgetedSpentCents,
    previousSpentCents: [...prevRows.values()].reduce((a, b) => a + b, 0),
    categories: rows
      .filter((r) => r.spentCents > 0)
      .map((r) => ({ categoryId: r.category.id, name: r.category.name, cents: r.spentCents, previousCents: prevRows.get(r.category.id) ?? 0 })),
    overBudget: rows
      .filter((r) => r.budgetCents != null && r.spentCents > r.budgetCents)
      .map((r) => ({ name: r.category.name, overCents: r.spentCents - (r.budgetCents ?? 0) })),
    paidBy: breakdown(data.expenses, month, (e) => e.paid_by).map((s) => ({ userId: s.id, cents: s.cents })),
    balanceCents: roundBalance(balanceFor(me, data.expenses, data.settlements)),
  };
}
