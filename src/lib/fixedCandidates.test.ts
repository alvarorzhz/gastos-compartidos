import { describe, expect, it } from 'vitest';
import { fixedCandidates } from './fixedCandidates';
import type { Expense } from './types';

let n = 0;
const exp = (note: string, spent_on: string, amount_cents: number, recurring_id: string | null = null): Expense => ({
  id: String(++n), household_id: 'h', amount_cents, spent_on, category_id: 'c', paid_by: 'a', owed_cents: null, note,
  recurring_id, created_by: 'a', created_at: spent_on + 'T10:00:00Z', updated_at: '',
});

const today = '2026-10-18';

describe('fixedCandidates', () => {
  it('propone lo que sale una vez al mes con importe parecido', () => {
    const list = [
      exp('Netflix', '2026-08-12', 1299),
      exp('Netflix', '2026-09-12', 1299),
      exp('netflix', '2026-10-13', 1399),
      exp('Luz', '2026-09-03', 6000),
      exp('Luz', '2026-10-04', 7100),
    ];
    const c = fixedCandidates(list, [], today);
    expect(c.map((x) => [x.note, x.months, x.amountCents, x.startOn])).toEqual([
      ['Luz', 2, 7100, '2026-11-04'],
      ['netflix', 3, 1399, '2026-11-13'],
    ]);
  });

  it('descarta compras frecuentes, importes muy distintos, meses salteados y lo viejo', () => {
    const list = [
      exp('Mercadona', '2026-09-05', 5000), exp('Mercadona', '2026-09-20', 3000), exp('Mercadona', '2026-10-05', 5000),
      exp('Regalo', '2026-09-10', 1000), exp('Regalo', '2026-10-10', 5000),
      exp('Peluquería', '2026-07-10', 1500), exp('Peluquería', '2026-09-10', 1500),
      exp('Gimnasio', '2026-06-01', 3000), exp('Gimnasio', '2026-07-01', 3000),
      exp('Día', '2026-09-01', 3000), exp('Día', '2026-10-20', 3000),
    ];
    expect(fixedCandidates(list, [], today)).toEqual([]);
  });

  it('no propone lo que ya es fijo ni lo descartado', () => {
    const list = [exp('Netflix', '2026-09-12', 1299), exp('Netflix', '2026-10-12', 1299), exp('Agua', '2026-09-01', 2000), exp('Agua', '2026-10-01', 2000)];
    expect(fixedCandidates(list, [{ note: 'NETFLIX' }], today, new Set(['agua']))).toEqual([]);
  });

  it('los gastos que ya apunta un fijo no cuentan', () => {
    const list = [exp('Alquiler', '2026-09-01', 70000, 'r'), exp('Alquiler', '2026-10-01', 70000, 'r')];
    expect(fixedCandidates(list, [], today)).toEqual([]);
  });
});
