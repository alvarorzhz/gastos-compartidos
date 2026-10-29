import { describe, expect, it } from 'vitest';
import { findDuplicates, mergedFields, pairKey, similarNotes } from './duplicates';
import type { Expense } from './types';

let n = 0;
function exp(over: Partial<Expense>): Expense {
  n++;
  return {
    id: 'e' + n,
    household_id: 'h',
    amount_cents: 4250,
    spent_on: '2026-10-20',
    category_id: 'c',
    paid_by: 'a',
    owed_cents: null,
    note: null,
    recurring_id: null,
    event_id: null,
    created_by: 'a',
    created_at: `2026-10-20T10:00:${String(n).padStart(2, '0')}Z`,
    updated_at: '2026-10-20T10:00:00Z',
    ...over,
  };
}

const TODAY = '2026-10-29';

describe('similarNotes', () => {
  it('reconoce el mismo comercio escrito distinto', () => {
    expect(similarNotes('MERCADONA VALENCIA', 'Mercadona')).toBe(true);
    expect(similarNotes('Café', 'cafe')).toBe(true);
  });
  it('sin concepto, podría ser cualquiera', () => {
    expect(similarNotes(null, 'Cena')).toBe(true);
  });
  it('conceptos distintos no', () => {
    expect(similarNotes('Cena', 'Gasolina')).toBe(false);
  });
});

describe('findDuplicates', () => {
  it('Apple Pay y ticket del mismo súper el mismo día', () => {
    const apple = exp({ note: 'MERCADONA' });
    const ticket = exp({ note: 'Mercadona compra semana', event_id: 'ev' });
    const [pair, ...rest] = findDuplicates([apple, ticket], TODAY, new Set());
    expect(rest).toHaveLength(0);
    expect(pair.keep.id).toBe(ticket.id); // tiene más información
    expect(pair.drop.id).toBe(apple.id);
  });

  it('cada uno apuntó lo mismo aunque lo llamen distinto', () => {
    const mine = exp({ note: 'Cena', created_by: 'a' });
    const hers = exp({ note: 'Restaurante', created_by: 'b', spent_on: '2026-10-21' });
    expect(findDuplicates([mine, hers], TODAY, new Set())).toHaveLength(1);
  });

  it('no junta importes distintos, fechas lejanas ni conceptos distintos de la misma persona', () => {
    expect(findDuplicates([exp({}), exp({ amount_cents: 4251 })], TODAY, new Set())).toHaveLength(0);
    expect(findDuplicates([exp({}), exp({ spent_on: '2026-10-24' })], TODAY, new Set())).toHaveLength(0);
    expect(findDuplicates([exp({ note: 'Cena' }), exp({ note: 'Gasolina' })], TODAY, new Set())).toHaveLength(0);
  });

  it('no mira importes pequeños ni gastos de hace más de 60 días', () => {
    expect(findDuplicates([exp({ amount_cents: 150 }), exp({ amount_cents: 150 })], TODAY, new Set())).toHaveLength(0);
    expect(findDuplicates([exp({ spent_on: '2026-08-01' }), exp({ spent_on: '2026-08-01' })], TODAY, new Set())).toHaveLength(0);
  });

  it('respeta «No son el mismo»', () => {
    const a = exp({});
    const b = exp({});
    expect(findDuplicates([a, b], TODAY, new Set([pairKey(b.id, a.id)]))).toHaveLength(0);
  });

  it('el fijo apuntado solo y el mismo a mano sí; dos periodos del mismo fijo no', () => {
    const fixed = exp({ recurring_id: 'r', note: 'Netflix' });
    const manual = exp({ note: 'Netflix' });
    expect(findDuplicates([fixed, manual], TODAY, new Set())[0].keep.id).toBe(fixed.id);
    expect(findDuplicates([exp({ recurring_id: 'r' }), exp({ recurring_id: 'r', spent_on: '2026-10-21' })], TODAY, new Set())).toHaveLength(0);
  });

  it('cada gasto aparece en una sola pareja', () => {
    const list = [exp({}), exp({}), exp({})];
    expect(findDuplicates(list, TODAY, new Set())).toHaveLength(1);
  });
});

describe('mergedFields', () => {
  it('pasa el concepto y el viaje que faltan', () => {
    expect(mergedFields(exp({}), exp({ note: 'Mercadona', event_id: 'ev' }))).toEqual({ note: 'Mercadona', event_id: 'ev' });
    expect(mergedFields(exp({ note: 'Súper' }), exp({ note: 'Mercadona' }))).toEqual({});
  });
});
