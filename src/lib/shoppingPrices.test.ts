import { describe, expect, it } from 'vitest';
import type { ShoppingItem } from './shopping';
import {
  itemEstimate, lastPrice, listEstimate, matchTicket, nameScore, prettyTicketName, shoppingBudgetLeft, shoppingCategory, ticketNewItems,
} from './shoppingPrices';
import type { Budget, Category, Expense } from './types';

let seq = 0;
function item(fields: Partial<ShoppingItem>): ShoppingItem {
  seq++;
  return {
    id: `id-${seq}`, household_id: 'h', name: 'Leche', quantity: 1, unit: null, category: 'otros', important: false,
    estimated_cents: null, status: 'pending', bought_at: null, bought_by: null, cleared_at: null, created_by: 'a',
    created_at: `2026-10-01T10:00:${String(seq).padStart(2, '0')}Z`, updated_at: `2026-10-01T10:00:${String(seq).padStart(2, '0')}Z`,
    ...fields,
  };
}
const bought = (name: string, at: string, extra: Partial<ShoppingItem> = {}) =>
  item({ name, status: 'bought', bought_at: at, cleared_at: at, updated_at: at, ...extra });

const category = (id: string, name: string, archived = false): Category => ({ id, household_id: 'h', name, archived, alert_percent: null });
const expense = (id: string, category_id: string, amount_cents: number, spent_on: string): Expense => ({
  id, household_id: 'h', amount_cents, spent_on, category_id, paid_by: 'a', owed_cents: null, note: null, recurring_id: null,
  created_by: 'a', created_at: spent_on, updated_at: spent_on,
});

describe('precios de la última vez', () => {
  const history = [
    bought('Leche', '2026-09-01T10:00:00Z', { price_cents: 600, quantity: 6 }),
    bought('leche', '2026-10-01T10:00:00Z', { price_cents: 540, quantity: 6 }),
    bought('Pan', '2026-10-02T10:00:00Z'),
  ];

  it('recuerda el último precio pagado, sin mirar mayúsculas', () => {
    expect(lastPrice('LECHE', history)).toMatchObject({ cents: 540, quantity: 6 });
    expect(lastPrice('Pan', history)).toBeNull();
  });

  it('ajusta el precio a la cantidad y prefiere el precio aproximado escrito', () => {
    expect(itemEstimate({ name: 'Leche', quantity: 2, unit: null, estimated_cents: null }, history)).toBe(180);
    expect(itemEstimate({ name: 'Leche', quantity: 1, unit: 'paquete', estimated_cents: null }, history)).toBe(540);
    expect(itemEstimate({ name: 'Leche', quantity: 2, unit: null, estimated_cents: 250 }, history)).toBe(250);
    expect(itemEstimate({ name: 'Huevos', quantity: 1, unit: null, estimated_cents: null }, history)).toBeNull();
  });

  it('suma lo que queda por comprar y cuenta lo que no tiene precio', () => {
    const list = [...history, item({ name: 'Leche', quantity: 6 }), item({ name: 'Huevos' }), item({ name: 'Pan', estimated_cents: 120 })];
    expect(listEstimate(list)).toEqual({ cents: 660, priced: 2, missing: 1 });
  });
});

describe('emparejar con el ticket', () => {
  it('los nombres se parecen aunque el ticket abrevie', () => {
    expect(nameScore('Aceitunas', 'ACEITUNAS RELLEN')).toBe(1);
    expect(nameScore('Anacardos tostados', 'ANACARDO TOST 0% SAL')).toBeGreaterThanOrEqual(0.8);
    expect(nameScore('Leche', 'GALLETAS FINAS BARQ LECHE')).toBe(1);
    expect(nameScore('Pan', 'PAPEL HIGIENICO')).toBe(0);
  });

  it('cada línea se usa una vez, gana lo aprendido y lo que no se parece se queda sin emparejar', () => {
    const lines = [
      { name: 'PAN DE LECHE 3%', cents: 160, quantity: 1 },
      { name: 'LECHE ENT. HACENDADO', cents: 540, quantity: 1 },
      { name: 'FONTEBIL P-6X1L', cents: 300, quantity: 1 },
      { name: 'DEVOLUCION', cents: -100, quantity: 1 },
    ];
    const leche = bought('Leche', '2026-10-10T10:00:00Z', { cleared_at: null });
    const agua = bought('Agua', '2026-10-10T10:00:00Z', { cleared_at: null });
    const pan = bought('Pan de leche', '2026-10-10T10:00:00Z', { cleared_at: null });
    const history = [bought('Agua', '2026-09-01T10:00:00Z', { ticket_name: 'FONTEBIL P-6X1L' }), bought('leche', '2026-09-01T10:00:00Z', { ticket_name: 'LECHE ENT. HACENDADO' })];
    const matches = matchTicket([leche, agua, pan], lines, [...history, leche, agua, pan]);
    expect(Object.fromEntries(matches.map((m) => [m.itemId, m.line]))).toEqual({ [leche.id]: 1, [agua.id]: 2, [pan.id]: 0 });
    expect(matchTicket([item({ name: 'Detergente' })], lines, [])).toEqual([]);
  });

  it('enseña el nombre del ticket más legible', () => {
    expect(prettyTicketName('ANACARDO TOST 0% SAL')).toBe('Anacardo tost 0% sal');
  });
});

describe('productos del ticket que no están en la lista', () => {
  const line = (name: string, cents: number, quantity = 1) => ({ name, cents, quantity });

  it('crea uno por línea con su precio, sin las ya emparejadas ni los descuentos', () => {
    const lines = [line('LECHE ENT. HACENDADO', 540, 6), line('ANACARDO TOST 0% SAL', 299), line('DESCUENTO', -50), line('PLATANO CANARIAS', 180)];
    const fresh = ticketNewItems(lines, new Set([0]), []);
    expect(fresh.map((f) => [f.line, f.name, f.cents, f.quantity, f.category])).toEqual([
      [1, 'Anacardo tost 0% sal', 299, 1, 'despensa'],
      [3, 'Platano canarias', 180, 1, 'fruta'],
    ]);
    expect(fresh[0].ticketName).toBe('ANACARDO TOST 0% SAL');
  });

  it('usa el nombre y la categoría de lo que ya se compró otras veces', () => {
    const history = [
      bought('Agua', '2026-09-01T10:00:00Z', { ticket_name: 'FONTEBIL P-6X1L', category: 'bebidas' }),
      bought('Aceitunas', '2026-09-02T10:00:00Z', { category: 'despensa' }),
    ];
    const fresh = ticketNewItems([line('FONTEBIL P-6X1L', 199), line('ACEITUNAS RELLEN', 129)], new Set(), history);
    expect(fresh.map((f) => [f.name, f.category])).toEqual([['Agua', 'bebidas'], ['Aceitunas', 'despensa']]);
  });

  it('junta una misma línea repetida', () => {
    const fresh = ticketNewItems([line('PAN BARRA', 60), line('PAN BARRA', 60)], new Set(), []);
    expect(fresh).toHaveLength(1);
    expect(fresh[0]).toMatchObject({ cents: 120, quantity: 2 });
  });
});

describe('presupuesto de la compra', () => {
  const cats = [category('c1', 'Casa'), category('c2', 'Supermercado'), category('c3', 'Restaurantes')];

  it('usa la categoría del último gasto de la compra o la del súper', () => {
    expect(shoppingCategory(cats, [], [])?.id).toBe('c2');
    const exps = [expense('e1', 'c3', 1000, '2026-10-05')];
    expect(shoppingCategory(cats, exps, [bought('Pan', '2026-10-05T10:00:00Z', { expense_id: 'e1' })])?.id).toBe('c3');
    expect(shoppingCategory([category('c1', 'Casa')], [], [])?.id).toBe('c1');
  });

  it('calcula lo que queda este mes', () => {
    const budgets: Budget[] = [{ household_id: 'h', category_id: 'c2', month: '2026-09-01', amount_cents: 30000 }];
    const exps = [expense('e1', 'c2', 12000, '2026-10-03'), expense('e2', 'c2', 5000, '2026-09-30'), expense('e3', 'c1', 999, '2026-10-03')];
    expect(shoppingBudgetLeft(cats[1], exps, budgets, '2026-10-17')).toBe(18000);
    expect(shoppingBudgetLeft(cats[0], exps, budgets, '2026-10-17')).toBeNull();
  });
});
