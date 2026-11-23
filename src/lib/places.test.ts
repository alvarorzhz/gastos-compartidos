import { describe, expect, it } from 'vitest';
import { groupPlaces, placedExpenses, roundSpot, spotRadius } from './places';
import type { Category, Expense } from './types';

const cats = [{ id: 'c-super', name: 'Supermercado' }, { id: 'c-ocio', name: 'Ocio' }] as Category[];
const exp = (id: string, cents: number, note: string | null, lat: number | null, lng: number | null, spent_on = '2026-11-10', category_id = 'c-super'): Expense => ({
  id, household_id: 'h', amount_cents: cents, spent_on, category_id, paid_by: 'a', owed_cents: null, note,
  recurring_id: null, created_by: 'a', created_at: '', updated_at: '', lat, lng,
});

describe('roundSpot', () => {
  it('redondea a 4 decimales', () => {
    expect(roundSpot(40.416775, -3.70379)).toEqual({ lat: 40.4168, lng: -3.7038 });
  });
  it('rechaza lo imposible', () => {
    expect(roundSpot(NaN, 0)).toBeNull();
    expect(roundSpot(91, 0)).toBeNull();
    expect(roundSpot(0, 181)).toBeNull();
  });
});

describe('placedExpenses', () => {
  const list = [exp('1', 100, 'A', 40, -3), exp('2', 100, 'B', null, null), exp('3', 100, 'C', 40, -3, '2026-10-02')];
  it('solo los que tienen sitio', () => {
    expect(placedExpenses(list).map((e) => e.id)).toEqual(['1', '3']);
  });
  it('del mes pedido', () => {
    expect(placedExpenses(list, '2026-11').map((e) => e.id)).toEqual(['1']);
    expect(placedExpenses(list, '2026-11-01').map((e) => e.id)).toEqual(['1']);
  });
});

describe('groupPlaces', () => {
  it('junta lo cercano y ordena por dinero', () => {
    const places = groupPlaces(placedExpenses([
      exp('1', 5000, 'Mercadona', 40.4168, -3.7038),
      exp('2', 3000, 'mercadona', 40.4169, -3.7037),
      exp('3', 2000, 'Pan', 40.4168, -3.7038),
      exp('4', 9500, null, 41.3874, 2.1686, '2026-11-11', 'c-ocio'),
    ]), cats);
    expect(places).toHaveLength(2);
    expect(places[0]).toMatchObject({ name: 'Mercadona', count: 3, cents: 10000 });
    expect(places[1]).toMatchObject({ name: 'Ocio', count: 1, cents: 9500 });
    expect(places[0].expenseIds).toEqual(['1', '2', '3']);
  });
  it('sin gastos, sin sitios', () => {
    expect(groupPlaces([], cats)).toEqual([]);
  });
});

describe('spotRadius', () => {
  it('el más grande es el mayor y ninguno desaparece', () => {
    expect(spotRadius(10000, 10000)).toBe(24);
    expect(spotRadius(0, 10000)).toBe(7);
    expect(spotRadius(2500, 10000)).toBeGreaterThan(7);
    expect(spotRadius(5, 0)).toBe(8);
  });
});
