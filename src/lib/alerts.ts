import { monthOf } from './dates';
import type { AlertPercent, Budget, Category, Expense } from './types';

export const ALERT_OPTIONS: { value: AlertPercent | null; label: string }[] = [
  { value: 80, label: '80 %' },
  { value: 90, label: '90 %' },
  { value: 100, label: '100 %' },
  { value: null, label: 'No avisar' },
];

export interface BudgetAlert {
  category: Category;
  spentCents: number;
  budgetCents: number;
  /** Porcentaje gastado, redondeado hacia abajo. */
  percent: number;
}

/** Categorías que en ese mes han llegado al porcentaje de aviso que tienen elegido. */
export function budgetAlerts(month: string, categories: Category[], expenses: Expense[], budgets: Budget[]): BudgetAlert[] {
  const budgetOf = new Map(budgets.filter((b) => b.month === month).map((b) => [b.category_id, b.amount_cents]));
  const spentOf = new Map<string, number>();
  for (const e of expenses) {
    if (monthOf(e.spent_on) === month) spentOf.set(e.category_id, (spentOf.get(e.category_id) ?? 0) + e.amount_cents);
  }
  const alerts: BudgetAlert[] = [];
  for (const category of categories) {
    const budgetCents = budgetOf.get(category.id);
    if (category.alert_percent == null || !budgetCents) continue;
    const spentCents = spentOf.get(category.id) ?? 0;
    if (spentCents * 100 < budgetCents * category.alert_percent) continue;
    alerts.push({ category, spentCents, budgetCents, percent: Math.floor((spentCents * 100) / budgetCents) });
  }
  return alerts.sort((a, b) => b.percent - a.percent);
}

const level = (a: BudgetAlert) => a.category.id + (a.spentCents > a.budgetCents ? ':pasado' : ':cerca');

/** Avisos nuevos tras un cambio: categorías que acaban de llegar al aviso o de pasarse del presupuesto. */
export function newAlerts(before: BudgetAlert[], after: BudgetAlert[]): BudgetAlert[] {
  const had = new Set(before.map(level));
  return after.filter((a) => !had.has(level(a)));
}

export function alertText(a: BudgetAlert): string {
  if (a.spentCents > a.budgetCents) return `${a.category.name}: os habéis pasado del presupuesto (${a.percent} %)`;
  if (a.percent >= 100) return `${a.category.name}: habéis gastado todo el presupuesto`;
  return `${a.category.name}: lleváis el ${a.percent} % del presupuesto`;
}
