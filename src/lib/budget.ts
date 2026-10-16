import { monthOf } from './dates';
import type { Budget, Category, Expense } from './types';

export interface BudgetRow {
  category: Category;
  budgetCents: number | null;
  spentCents: number;
}

/**
 * Presupuesto vigente de cada categoría en un mes ("YYYY-MM-01").
 * Un límite se mantiene los meses siguientes hasta que se cambie: vale el último
 * guardado en ese mes o antes. Un límite de 0 significa "quitado desde ese mes".
 */
export function effectiveBudgets(month: string, budgets: Budget[]): Map<string, number> {
  const latest = new Map<string, Budget>();
  for (const b of budgets) {
    if (b.month > month) continue;
    const prev = latest.get(b.category_id);
    if (!prev || b.month > prev.month) latest.set(b.category_id, b);
  }
  const result = new Map<string, number>();
  for (const [id, b] of latest) if (b.amount_cents > 0) result.set(id, b.amount_cents);
  return result;
}

/**
 * Compara presupuesto y gasto real por categoría para un mes ("YYYY-MM-01").
 * Incluye las categorías activas y las archivadas que tengan gasto ese mes.
 */
export function monthlySummary(month: string, categories: Category[], expenses: Expense[], budgets: Budget[]): BudgetRow[] {
  const spent = new Map<string, number>();
  for (const e of expenses) {
    if (monthOf(e.spent_on) !== month) continue;
    spent.set(e.category_id, (spent.get(e.category_id) ?? 0) + e.amount_cents);
  }
  const budgeted = effectiveBudgets(month, budgets);
  return categories
    .filter((c) => !c.archived || spent.has(c.id))
    .map((c) => ({ category: c, budgetCents: budgeted.get(c.id) ?? null, spentCents: spent.get(c.id) ?? 0 }))
    .sort((a, b) => b.spentCents - a.spentCents || a.category.name.localeCompare(b.category.name, 'es'));
}

/**
 * Totales del mes. budgetedSpentCents es lo gastado solo en categorías con presupuesto:
 * es lo que se compara con el presupuesto (lo gastado en categorías sin límite no os "pasa").
 */
export function totals(rows: BudgetRow[]): { budgetCents: number; spentCents: number; budgetedSpentCents: number } {
  return rows.reduce(
    (acc, r) => ({
      budgetCents: acc.budgetCents + (r.budgetCents ?? 0),
      spentCents: acc.spentCents + r.spentCents,
      budgetedSpentCents: acc.budgetedSpentCents + (r.budgetCents != null ? r.spentCents : 0),
    }),
    { budgetCents: 0, spentCents: 0, budgetedSpentCents: 0 },
  );
}
