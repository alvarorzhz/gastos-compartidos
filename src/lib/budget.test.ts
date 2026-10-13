import { describe, expect, it } from 'vitest';
import { monthlySummary, totals } from './budget';
import type { Budget, Category, Expense } from './types';

const cat = (id: string, name: string, archived = false): Category => ({ id, household_id: 'h', name, archived });
const exp = (category_id: string, spent_on: string, amount_cents: number): Expense => ({
  id: Math.random().toString(), household_id: 'h', amount_cents, spent_on, category_id, paid_by: 'a',
  owed_cents: null, note: null, created_by: 'a', created_at: '', updated_at: '',
});

describe('monthlySummary', () => {
  const categories = [cat('super', 'Supermercado'), cat('ocio', 'Ocio'), cat('viejo', 'Viejo', true)];
  const expenses = [exp('super', '2026-10-03', 5000), exp('super', '2026-10-30', 2500), exp('ocio', '2026-09-30', 9999)];
  const budgets: Budget[] = [
    { household_id: 'h', category_id: 'super', month: '2026-10-01', amount_cents: 30000 },
    { household_id: 'h', category_id: 'ocio', month: '2026-09-01', amount_cents: 100 },
  ];

  it('suma solo el gasto del mes y compara con su presupuesto', () => {
    const rows = monthlySummary('2026-10-01', categories, expenses, budgets);
    expect(rows.map((r) => [r.category.id, r.budgetCents, r.spentCents])).toEqual([
      ['super', 30000, 7500],
      ['ocio', null, 0],
    ]);
    expect(totals(rows)).toEqual({ budgetCents: 30000, spentCents: 7500 });
  });

  it('muestra una categoría archivada si tuvo gasto ese mes', () => {
    const rows = monthlySummary('2026-10-01', categories, [...expenses, exp('viejo', '2026-10-05', 100)], budgets);
    expect(rows.some((r) => r.category.id === 'viejo')).toBe(true);
  });
});
