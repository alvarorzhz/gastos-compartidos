import { describe, expect, it } from 'vitest';
import { habituals } from './favorites';
import type { Expense } from './types';

let n = 0;
const exp = (note: string | null, category_id: string, amount_cents: number, spent_on: string, recurring_id: string | null = null): Expense => ({
  id: String(++n), household_id: 'h', amount_cents, spent_on, category_id, paid_by: 'a', owed_cents: null, note,
  recurring_id, created_by: 'a', created_at: spent_on + 'T10:00:00Z', updated_at: '',
});

describe('habituals', () => {
  const list = [
    exp('Café', 'bar', 150, '2026-10-01'),
    exp('cafe', 'bar', 160, '2026-10-10'),
    exp('Café', 'bar', 150, '2026-10-12'),
    exp('Gasolina', 'coche', 6000, '2026-09-20'),
    exp('Gasolina', 'coche', 5500, '2026-10-05'),
    exp('Cena', 'bar', 4000, '2026-10-03'),
    exp('Alquiler', 'casa', 80000, '2026-10-01', 'fijo'),
    exp('Alquiler', 'casa', 80000, '2026-09-01', 'fijo'),
    exp('Viejo', 'otros', 100, '2026-01-01'),
    exp('Viejo', 'otros', 100, '2026-01-02'),
  ];
  it('ordena por frecuencia y usa el último importe', () => {
    const h = habituals(list, '2026-10-16');
    expect(h.map((x) => [x.note, x.count, x.amountCents])).toEqual([
      ['Café', 3, 150],
      ['Gasolina', 2, 5500],
    ]);
  });
});
