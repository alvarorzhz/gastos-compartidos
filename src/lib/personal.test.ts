import { describe, expect, it } from 'vitest';
import { categoryOptions, myCommonShare, personalMonth } from './personal';
import type { Expense, PersonalEntry } from './types';

const entry = (kind: PersonalEntry['kind'], amount_cents: number, entry_on: string, category = 'Otros'): PersonalEntry => ({
  id: Math.random().toString(), user_id: 'a', kind, amount_cents, entry_on, category, note: null, created_at: '',
});
const exp = (paid_by: string, amount_cents: number, spent_on: string, owed_cents: number | null = null): Expense => ({
  id: Math.random().toString(), household_id: 'h', amount_cents, spent_on, category_id: 'c', paid_by,
  owed_cents, note: null, recurring_id: null, created_by: paid_by, created_at: '', updated_at: '',
});

describe('personalMonth', () => {
  it('suma ingresos y gastos del mes', () => {
    const entries = [entry('income', 200000, '2026-10-01'), entry('expense', 4999, '2026-10-05'), entry('expense', 1000, '2026-09-30')];
    expect(personalMonth(entries, '2026-10-01')).toEqual({ incomeCents: 200000, expenseCents: 4999, netCents: 195001 });
  });
});

describe('myCommonShare', () => {
  it('cuenta mi parte de cada gasto común del mes, pague quien pague', () => {
    const expenses = [exp('a', 1000, '2026-10-01'), exp('b', 3000, '2026-10-02', 3000), exp('b', 500, '2026-10-03', 0), exp('a', 999, '2026-09-01')];
    // 50/50 de 10 € → 5 €; "todo mío" pagado por b → 30 €; "todo de b" → 0 €
    expect(myCommonShare('a', expenses, '2026-10-01')).toBe(3500);
  });
});

describe('categoryOptions', () => {
  it('añade las categorías ya usadas sin repetir', () => {
    const opts = categoryOptions([entry('expense', 1, '2026-10-01', 'Gimnasio'), entry('expense', 1, '2026-10-01', 'Ropa')], 'expense');
    expect(opts.filter((o) => o === 'Ropa')).toHaveLength(1);
    expect(opts).toContain('Gimnasio');
    expect(categoryOptions([], 'income')[0]).toBe('Nómina');
  });
});
