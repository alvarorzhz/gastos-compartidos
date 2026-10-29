import { describe, expect, it } from 'vitest';
import { roundUp, suggestBudgets } from './budgetSuggest';
import type { Budget, Category, Expense } from './types';

const cat = (id: string, archived = false): Category => ({ id, household_id: 'h', name: id, archived, alert_percent: 90 });
const exp = (category_id: string, spent_on: string, amount_cents: number): Expense => ({
  id: Math.random().toString(), household_id: 'h', amount_cents, spent_on, category_id, paid_by: 'a',
  owed_cents: null, note: null, recurring_id: null, created_by: 'a', created_at: '', updated_at: '',
});
const budget = (category_id: string, month: string, amount_cents: number): Budget => ({ household_id: 'h', category_id, month, amount_cents });

const MONTH = '2026-11-01';
/** Gasto en agosto, septiembre y octubre. */
const three = (id: string, [a, b, c]: number[]) => [exp(id, '2026-08-10', a), exp(id, '2026-09-10', b), exp(id, '2026-10-10', c)];

describe('roundUp', () => {
  it('a 5 € hasta 100 € y a 10 € por encima', () => {
    expect(roundUp(4210)).toBe(4500);
    expect(roundUp(10000)).toBe(10000);
    expect(roundUp(31220)).toBe(32000);
  });
});

describe('suggestBudgets', () => {
  it('propone un límite a lo que se gasta cada mes y no lo tiene, con el mes normal', () => {
    const [s] = suggestBudgets(MONTH, [cat('super')], three('super', [30000, 90000, 31220]), []);
    expect(s).toMatchObject({ reason: 'new', currentCents: null, suggestedCents: 32000, monthsCents: [30000, 90000, 31220] });
  });

  it('no propone nada si aún no hay 3 meses de datos', () => {
    const expenses = [exp('super', '2026-09-10', 30000), exp('super', '2026-10-10', 30000)];
    expect(suggestBudgets(MONTH, [cat('super')], expenses, [])).toEqual([]);
  });

  it('se salta lo que no se gasta todos los meses, lo pequeño y lo archivado', () => {
    const expenses = [...three('ropa', [0, 20000, 5000]), ...three('cafe', [800, 900, 700]), ...three('viejo', [9000, 9000, 9000])];
    expect(suggestBudgets(MONTH, [cat('ropa'), cat('cafe'), cat('viejo', true)], expenses, [])).toEqual([]);
  });

  it('propone subir si os pasáis casi siempre y bajar si os sobra todos los meses', () => {
    const expenses = [...three('super', [36000, 38000, 29000]), ...three('ocio', [5000, 6000, 4000])];
    const budgets = [budget('super', '2026-01-01', 30000), budget('ocio', '2026-01-01', 15000)];
    const result = suggestBudgets(MONTH, [cat('super'), cat('ocio')], expenses, budgets);
    expect(result.map((s) => [s.category.id, s.reason, s.suggestedCents])).toEqual([
      ['ocio', 'under', 5000],
      ['super', 'over', 36000],
    ]);
  });

  it('no toca un límite que ya va bien', () => {
    const budgets = [budget('super', '2026-01-01', 32000)];
    expect(suggestBudgets(MONTH, [cat('super')], three('super', [30000, 33000, 31000]), budgets)).toEqual([]);
  });
});
