import { describe, expect, it } from 'vitest';
import { alertText, budgetAlerts } from './alerts';
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

describe('alertText', () => {
  const category = { id: 'c', household_id: 'h', name: 'Casa', archived: false, alert_percent: 90 as const };
  const plain = (s: string) => s.replace(/\u00a0/g, ' ');
  it('habla en euros y en cercano', () => {
    expect(plain(alertText({ category, spentCents: 9200, budgetCents: 10000, percent: 92 }))).toBe('Ojo con Casa: os quedan 8,00 € este mes');
    expect(plain(alertText({ category, spentCents: 10000, budgetCents: 10000, percent: 100 }))).toBe('Casa: habéis llegado justo a lo previsto');
    expect(plain(alertText({ category, spentCents: 12000, budgetCents: 10000, percent: 120 }))).toBe('Casa: os habéis pasado 20,00 € este mes');
  });
});
