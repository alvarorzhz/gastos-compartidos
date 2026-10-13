import { describe, expect, it } from 'vitest';
import { averageOfActive, breakdown, monthlyTotals } from './stats';
import type { Expense } from './types';

const exp = (category_id: string, spent_on: string, amount_cents: number, paid_by = 'a'): Expense => ({
  id: Math.random().toString(), household_id: 'h', amount_cents, spent_on, category_id, paid_by,
  owed_cents: null, note: null, recurring_id: null, created_by: 'a', created_at: '', updated_at: '',
});

const expenses = [exp('super', '2026-10-03', 5000), exp('ocio', '2026-10-20', 1000, 'b'), exp('super', '2026-08-01', 3000), exp('super', '2025-10-01', 999)];

describe('monthlyTotals', () => {
  it('suma por mes, incluye meses vacíos y filtra por categoría', () => {
    const t = monthlyTotals(expenses, [{ household_id: 'h', category_id: 'super', month: '2026-10-01', amount_cents: 20000 }], '2026-10-01', 3);
    expect(t.map((x) => [x.month, x.spentCents, x.budgetCents])).toEqual([
      ['2026-08-01', 3000, null],
      ['2026-09-01', 0, null],
      ['2026-10-01', 6000, 20000],
    ]);
    expect(monthlyTotals(expenses, [], '2026-10-01', 1, 'ocio')[0].spentCents).toBe(1000);
    expect(averageOfActive(t)).toBe(4500);
  });
});

describe('breakdown', () => {
  it('reparte el mes por categoría o por quién pagó', () => {
    expect(breakdown(expenses, '2026-10-01', (e) => e.category_id)).toEqual([
      { id: 'super', cents: 5000, share: 5000 / 6000 },
      { id: 'ocio', cents: 1000, share: 1000 / 6000 },
    ]);
    expect(breakdown(expenses, '', (e) => e.paid_by).map((s) => s.id)).toEqual(['a', 'b']);
  });
});
