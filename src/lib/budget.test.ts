import { describe, expect, it } from 'vitest';
import { effectiveBudgets, monthlySummary, totals } from './budget';
import type { Budget, Category, Expense } from './types';

const cat = (id: string, name: string, archived = false): Category => ({ id, household_id: 'h', name, archived, alert_percent: 90 });
const exp = (category_id: string, spent_on: string, amount_cents: number): Expense => ({
  id: Math.random().toString(), household_id: 'h', amount_cents, spent_on, category_id, paid_by: 'a',
  owed_cents: null, note: null, recurring_id: null, created_by: 'a', created_at: '', updated_at: '',
});

describe('monthlySummary', () => {
  const categories = [cat('super', 'Supermercado'), cat('ocio', 'Ocio'), cat('viejo', 'Viejo', true)];
  const expenses = [exp('super', '2026-10-03', 5000), exp('super', '2026-10-30', 2500), exp('ocio', '2026-09-30', 9999)];
  const budgets: Budget[] = [
    { household_id: 'h', category_id: 'super', month: '2026-10-01', amount_cents: 30000 },
    { household_id: 'h', category_id: 'ocio', month: '2026-09-01', amount_cents: 100 },
  ];

  it('suma solo el gasto del mes y compara con su presupuesto (el de septiembre sigue en octubre)', () => {
    const rows = monthlySummary('2026-10-01', categories, expenses, budgets);
    expect(rows.map((r) => [r.category.id, r.budgetCents, r.spentCents])).toEqual([
      ['super', 30000, 7500],
      ['ocio', 100, 0],
    ]);
    expect(totals(rows)).toEqual({ budgetCents: 30100, spentCents: 7500, budgetedSpentCents: 7500 });
  });

  it('no compara con el presupuesto lo gastado en categorías sin límite', () => {
    const rows = monthlySummary('2026-10-01', [...categories, cat('resto', 'Restaurantes')], [...expenses, exp('resto', '2026-10-04', 50000)], budgets);
    expect(totals(rows)).toEqual({ budgetCents: 30100, spentCents: 57500, budgetedSpentCents: 7500 });
  });

  it('muestra una categoría archivada si tuvo gasto ese mes', () => {
    const rows = monthlySummary('2026-10-01', categories, [...expenses, exp('viejo', '2026-10-05', 100)], budgets);
    expect(rows.some((r) => r.category.id === 'viejo')).toBe(true);
  });
});

describe('effectiveBudgets', () => {
  const b = (category_id: string, month: string, amount_cents: number): Budget => ({ household_id: 'h', category_id, month, amount_cents });
  const budgets = [b('super', '2026-08-01', 30000), b('super', '2026-10-01', 35000), b('ocio', '2026-08-01', 5000), b('ocio', '2026-09-01', 0)];

  it('mantiene el límite los meses siguientes hasta que se cambia', () => {
    expect(effectiveBudgets('2026-07-01', budgets).size).toBe(0);
    expect(effectiveBudgets('2026-08-01', budgets).get('super')).toBe(30000);
    expect(effectiveBudgets('2026-09-01', budgets).get('super')).toBe(30000);
    expect(effectiveBudgets('2026-10-01', budgets).get('super')).toBe(35000);
    expect(effectiveBudgets('2027-03-01', budgets).get('super')).toBe(35000);
  });

  it('un límite de 0 lo quita desde ese mes', () => {
    expect(effectiveBudgets('2026-08-01', budgets).get('ocio')).toBe(5000);
    expect(effectiveBudgets('2026-09-01', budgets).has('ocio')).toBe(false);
    expect(effectiveBudgets('2026-12-01', budgets).has('ocio')).toBe(false);
  });

  it('no muestra categorías archivadas solo por tener presupuesto', () => {
    const rows = monthlySummary('2026-10-01', [cat('viejo', 'Viejo', true)], [], [b('viejo', '2026-01-01', 100)]);
    expect(rows).toEqual([]);
  });
});
