import { describe, expect, it } from 'vitest';
import { suggestForNote } from './suggest';
import type { Expense, Member } from './types';

let n = 0;
const exp = (note: string, category_id: string, paid_by: string, spent_on: string, owed_cents: number | null = null, amount_cents = 1000): Expense => ({
  id: String(++n), household_id: 'h', amount_cents, spent_on, category_id, paid_by, owed_cents, note,
  recurring_id: null, created_by: paid_by, created_at: spent_on + 'T10:00:00Z', updated_at: '',
});

const members: Member[] = [
  { household_id: 'h', user_id: 'a', display_name: 'Alvaro' },
  { household_id: 'h', user_id: 'b', display_name: 'Ana' },
];
const categories = [
  { id: 'super', name: 'Supermercado', archived: false },
  { id: 'casa', name: 'Casa', archived: false },
  { id: 'coche', name: 'Transporte', archived: false },
  { id: 'viejo', name: 'Viejo', archived: true },
];
const ctx = (expenses: Expense[], me = 'a') => ({ expenses, categories, members, me });

describe('suggestForNote', () => {
  it('copia categoría, quien suele pagar y el reparto de otras veces', () => {
    const list = [
      exp('Mercadona', 'super', 'b', '2026-10-01', 400),
      exp('mercadona', 'super', 'b', '2026-10-08', 400),
      exp('Mercadona', 'super', 'a', '2026-09-20'),
    ];
    // La última vez pagó Ana y a Alvaro le tocaban 4 € de 10 €: un 40 %.
    expect(suggestForNote('Mercadona', ctx(list))).toEqual({
      categoryId: 'super', paidBy: 'b', split: { mode: 'percent', myShare: '40' }, from: 'history',
    });
  });

  it('acepta el principio del concepto y elige el más usado', () => {
    const list = [exp('Mercadona', 'super', 'a', '2026-10-01'), exp('Mercadona', 'super', 'a', '2026-10-02'), exp('Mercería', 'casa', 'a', '2026-10-03')];
    expect(suggestForNote('mer', ctx(list))?.categoryId).toBe('super');
  });

  it('no cambia quién paga si va alternando', () => {
    const list = [exp('Cena', 'super', 'a', '2026-10-01'), exp('Cena', 'super', 'b', '2026-10-02')];
    expect(suggestForNote('Cena', ctx(list))?.paidBy).toBeNull();
  });

  it('sin historial reconoce el comercio', () => {
    expect(suggestForNote('Repsol', ctx([]))).toEqual({ categoryId: 'coche', paidBy: null, split: null, from: 'rules' });
  });

  it('ignora categorías archivadas y textos cortos', () => {
    expect(suggestForNote('Lo de siempre', ctx([exp('Lo de siempre', 'viejo', 'a', '2026-10-01')]))).toBeNull();
    expect(suggestForNote('me', ctx([exp('me', 'super', 'a', '2026-10-01')]))).toBeNull();
  });
});
