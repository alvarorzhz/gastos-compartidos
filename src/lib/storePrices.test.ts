import { describe, expect, it } from 'vitest';
import type { ShoppingItem } from './shopping';
import { cheaperElsewhere, compareProducts, listSavingsByStore, pricesByStore, storeName } from './storePrices';
import type { Expense } from './types';

const NOW = new Date('2026-10-20T12:00:00Z');
let seq = 0;
function item(fields: Partial<ShoppingItem>): ShoppingItem {
  seq++;
  return {
    id: `id-${seq}`, household_id: 'h', name: 'Leche', quantity: 1, unit: null, category: 'otros', important: false,
    estimated_cents: null, status: 'pending', bought_at: null, bought_by: null, cleared_at: null, created_by: 'a',
    created_at: '2026-10-01T10:00:00Z', updated_at: '2026-10-01T10:00:00Z', ...fields,
  };
}
const bought = (name: string, at: string, price: number, expenseId: string, extra: Partial<ShoppingItem> = {}) =>
  item({ name, status: 'bought', bought_at: at, cleared_at: at, price_cents: price, expense_id: expenseId, ...extra });
const expense = (id: string, note: string | null): Expense => ({
  id, household_id: 'h', amount_cents: 1000, spent_on: '2026-10-01', category_id: 'c', paid_by: 'a', owed_cents: null, note,
  recurring_id: null, created_by: 'a', created_at: '2026-10-01', updated_at: '2026-10-01',
});

const expenses = [expense('m1', 'MERCADONA S.A.'), expense('m2', 'Mercadona'), expense('l1', 'Lidl'), expense('x', null), expense('old', 'Dia')];

describe('dónde sale más barato', () => {
  it('reconoce la tienda por el concepto del gasto', () => {
    expect(storeName('MERCADONA S.A. AVDA')).toBe('Mercadona');
    expect(storeName('FRUTERIA PEPE')).toBe('Fruteria pepe');
    expect(storeName('  ')).toBeNull();
  });

  it('se queda con el último precio de cada tienda, por unidad y del más barato al más caro', () => {
    const items = [
      bought('Leche', '2026-09-01T10:00:00Z', 600, 'm1', { quantity: 6 }), // antiguo en Mercadona
      bought('leche', '2026-10-10T10:00:00Z', 660, 'm2', { quantity: 6 }), // último en Mercadona: 1,10
      bought('Leche', '2026-10-05T10:00:00Z', 95, 'l1'), // Lidl: 0,95
      bought('Leche', '2026-10-06T10:00:00Z', 50, 'x'), // gasto sin concepto: no cuenta
      bought('Leche', '2026-01-01T10:00:00Z', 10, 'old'), // demasiado antiguo
      bought('Leche', '2026-10-07T10:00:00Z', 200, 'l1', { unit: 'l', quantity: 1 }), // otra medida
    ];
    expect(pricesByStore({ name: 'LECHE', unit: null }, items, expenses, NOW)).toEqual([
      { store: 'Lidl', unitCents: 95, boughtAt: '2026-10-05T10:00:00Z' },
      { store: 'Mercadona', unitCents: 110, boughtAt: '2026-10-10T10:00:00Z' },
    ]);
  });

  it('avisa si en otra tienda sale más barato que en la de la última compra, según la cantidad', () => {
    const items = [
      bought('Leche', '2026-10-10T10:00:00Z', 110, 'm2'),
      bought('Leche', '2026-10-05T10:00:00Z', 95, 'l1'),
      item({ name: 'Leche', quantity: 4 }),
    ];
    expect(cheaperElsewhere({ name: 'Leche', unit: null, quantity: 4 }, items, expenses, NOW)).toEqual({
      store: 'Lidl', cents: 380, usualStore: 'Mercadona', usualCents: 440, savingCents: 60,
    });
    expect(listSavingsByStore(items, expenses, NOW)).toEqual([{ store: 'Lidl', count: 1, savingCents: 60 }]);
  });

  it('no avisa si la última compra ya fue en la más barata o la diferencia es mínima', () => {
    const cheapestLast = [bought('Pan', '2026-10-10T10:00:00Z', 80, 'l1'), bought('Pan', '2026-10-01T10:00:00Z', 100, 'm2')];
    expect(cheaperElsewhere({ name: 'Pan', unit: null, quantity: 1 }, cheapestLast, expenses, NOW)).toBeNull();
    const tiny = [bought('Sal', '2026-10-10T10:00:00Z', 50, 'm2'), bought('Sal', '2026-10-01T10:00:00Z', 48, 'l1')];
    expect(cheaperElsewhere({ name: 'Sal', unit: null, quantity: 1 }, tiny, expenses, NOW)).toBeNull();
    const oneStore = [bought('Agua', '2026-10-10T10:00:00Z', 50, 'm2')];
    expect(cheaperElsewhere({ name: 'Agua', unit: null, quantity: 1 }, oneStore, expenses, NOW)).toBeNull();
  });

  it('lista los productos comprados en varias tiendas, primero los que más cambian', () => {
    const items = [
      bought('Pan', '2026-10-10T10:00:00Z', 100, 'm2'),
      bought('Pan', '2026-10-01T10:00:00Z', 90, 'l1'),
      bought('Café', '2026-10-10T10:00:00Z', 400, 'm2'),
      bought('Café', '2026-10-02T10:00:00Z', 200, 'l1'),
      bought('Agua', '2026-10-10T10:00:00Z', 50, 'm2'),
    ];
    expect(compareProducts(items, expenses, NOW).map((p) => p.name)).toEqual(['Café', 'Pan']);
  });
});
