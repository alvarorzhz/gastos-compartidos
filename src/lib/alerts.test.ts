import { describe, expect, it } from 'vitest';
import { budgetAlerts } from './alerts';
import type { AlertPercent, Budget, Category, Expense } from './types';

const cat = (id: string, alert_percent: AlertPercent | null): Category => ({ id, household_id: 'h', name: id, archived: false, alert_percent });
const exp = (category_id: string, amount_cents: number, spent_on = '2026-10-05'): Expense => ({
  id: Math.random().toString(), household_id: 'h', amount_cents, spent_on, category_id, paid_by: 'a',
  owed_cents: null, note: null, recurring_id: null, created_by: 'a', created_at: '', updated_at: '',
});
const budget = (category_id: string, amount_cents: number): Budget => ({ household_id: 'h', category_id, month: '2026-10-01', amount_cents });

describe('budgetAlerts', () => {
  const budgets = [budget('super', 10000), budget('ocio', 10000), budget('casa', 10000)];
  const categories = [cat('super', 80), cat('ocio', null), cat('casa', 100), cat('sinpresupuesto', 80)];

  it('avisa al llegar al porcentaje elegido y no antes', () => {
    expect(budgetAlerts('2026-10-01', categories, [exp('super', 7999)], budgets)).toEqual([]);
    const [a] = budgetAlerts('2026-10-01', categories, [exp('super', 8000)], budgets);
    expect(a.category.id).toBe('super');
    expect(a.percent).toBe(80);
  });

  it('respeta "no avisar", las categorías sin presupuesto y el mes', () => {
    const expenses = [exp('ocio', 50000), exp('sinpresupuesto', 50000), exp('super', 50000, '2026-09-30'), exp('casa', 9999)];
    expect(budgetAlerts('2026-10-01', categories, expenses, budgets)).toEqual([]);
  });
});
