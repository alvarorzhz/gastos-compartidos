import { describe, expect, it } from 'vitest';
import { monthForecast } from './forecast';
import type { Expense, RecurringExpense } from './types';

const exp = (spent_on: string, amount_cents: number, recurring_id: string | null = null): Expense => ({
  id: Math.random().toString(), household_id: 'h', amount_cents, spent_on, category_id: 'c', paid_by: 'a',
  owed_cents: null, note: null, recurring_id, created_by: 'a', created_at: '', updated_at: '',
});
const fixed = (start_on: string, amount_cents: number, generated_count: number, active = true): RecurringExpense => ({
  id: 'r', household_id: 'h', amount_cents, category_id: 'c', paid_by: 'a', owed_cents: null, note: null,
  frequency: 'monthly', start_on, generated_count, active, created_by: 'a', created_at: '',
});

describe('monthForecast', () => {
  it('no estima los primeros días del mes', () => {
    expect(monthForecast('2026-10-04', [exp('2026-10-01', 1000)], [])).toBeNull();
  });

  it('extrapola lo variable y suma los fijos ya apuntados sin extrapolarlos', () => {
    // Día 10 de 31: 100 € variables → 310 €; más 800 € de alquiler apuntado el día 1.
    const f = monthForecast('2026-10-10', [exp('2026-10-03', 10000), exp('2026-10-01', 80000, 'r1'), exp('2026-09-30', 5000)], []);
    expect(f?.cents).toBeCloseTo(80000 + 31000);
  });

  it('suma los fijos que aún faltan por llegar este mes', () => {
    // Gimnasio el día 20; ya se apuntaron 2 (agosto y septiembre).
    const f = monthForecast('2026-10-10', [], [fixed('2026-08-20', 4000, 2), fixed('2026-08-25', 999, 2, false)]);
    expect(f).toMatchObject({ cents: 4000, pendingFixedCents: 4000, pendingFixed: [{ note: 'Gasto fijo', cents: 4000, date: '2026-10-20' }] });
  });

  it('dice qué tal de fiable es y por qué', () => {
    // Día 6 con dos gastos: poco fiable, y el sofá pesa mucho en el ritmo.
    const early = monthForecast('2026-10-06', [exp('2026-10-02', 1500), { ...exp('2026-10-03', 40000), note: 'Sofá' }], []);
    expect(early?.reliability).toBe('low');
    expect(early?.variableCount).toBe(2);
    expect(early?.bigOne).toEqual({ note: 'Sofá', cents: 40000 });
    expect(early?.caveats).toHaveLength(3);
    // Día 22 con diez gastos parecidos: fiable.
    const many = Array.from({ length: 10 }, (_, i) => exp(`2026-10-${String(i * 2 + 1).padStart(2, '0')}`, 3000 + i * 100));
    const late = monthForecast('2026-10-22', many, []);
    expect(late?.reliability).toBe('good');
    expect(late?.caveats).toEqual([]);
    expect(late?.variableCents).toBe(34500);
    // Día 15: aún a medias.
    expect(monthForecast('2026-10-15', many.slice(0, 7), [])?.reliability).toBe('medium');
  });
});
