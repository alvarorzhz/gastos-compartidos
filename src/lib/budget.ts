import { monthOf } from './dates';
import type { Budget, Category, Expense } from './types';

export interface BudgetRow {
  category: Category;
  budgetCents: number | null;
  spentCents: number;
}

/**
 * Compara presupuesto y gasto real por categoría para un mes ("YYYY-MM-01").
 * Incluye las categorías activas y las archivadas que tengan gasto o presupuesto ese mes.
 */
export function monthlySummary(month: string, categories: Category[], expenses: Expense[], budgets: Budget[]): BudgetRow[] {
  const spent = new Map<string, number>();
  for (const e of expenses) {
    if (monthOf(e.spent_on) !== month) continue;
    spent.set(e.category_id, (spent.get(e.category_id) ?? 0) + e.amount_cents);
  }
  const budgeted = new Map<string, number>();
  for (const b of budgets) {
    if (b.month === month) budgeted.set(b.category_id, b.amount_cents);
  }
  return categories
    .filter((c) => !c.archived || spent.has(c.id) || budgeted.has(c.id))
    .map((c) => ({ category: c, budgetCents: budgeted.get(c.id) ?? null, spentCents: spent.get(c.id) ?? 0 }))
    .sort((a, b) => b.spentCents - a.spentCents || a.category.name.localeCompare(b.category.name, 'es'));
}

export function totals(rows: BudgetRow[]): { budgetCents: number; spentCents: number } {
  return rows.reduce(
    (acc, r) => ({ budgetCents: acc.budgetCents + (r.budgetCents ?? 0), spentCents: acc.spentCents + r.spentCents }),
    { budgetCents: 0, spentCents: 0 },
  );
}
