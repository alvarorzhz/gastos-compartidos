import { describe, expect, it } from 'vitest';
import {
  currentBought, formatQuantity, frequentAndRecent, guessCategory, matchesFilter, parseQuantity, parseQuickAdd,
  pendingMatch, sortPending, suggestNames, tripProgress, type ShoppingItem,
} from './shopping';

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

describe('parseQuickAdd', () => {
  it('un nombre solo', () => {
    expect(parseQuickAdd('  leche ')).toEqual({ name: 'Leche', quantity: null, unit: null });
  });
  it('cantidad delante, con o sin unidad', () => {
    expect(parseQuickAdd('2 leche')).toEqual({ name: 'Leche', quantity: 2, unit: null });
    expect(parseQuickAdd('1,5 kg patatas')).toEqual({ name: 'Patatas', quantity: 1.5, unit: 'kg' });
    expect(parseQuickAdd('500g queso rallado')).toEqual({ name: 'Queso rallado', quantity: 500, unit: 'g' });
    expect(parseQuickAdd('2 paquetes de galletas')).toEqual({ name: 'Galletas', quantity: 2, unit: 'paquete' });
    expect(parseQuickAdd('3 litros de agua')).toEqual({ name: 'Agua', quantity: 3, unit: 'l' });
  });
  it('cantidad detrás', () => {
    expect(parseQuickAdd('leche x6')).toEqual({ name: 'Leche', quantity: 6, unit: null });
    expect(parseQuickAdd('Tomates 2 kg')).toEqual({ name: 'Tomates', quantity: 2, unit: 'kg' });
  });
  it('no confunde nombres con números', () => {
    expect(parseQuickAdd('7up')).toEqual({ name: '7up', quantity: null, unit: null });
    expect(parseQuickAdd('0 leche').quantity).toBeNull();
    expect(parseQuickAdd('2')).toEqual({ name: '2', quantity: null, unit: null });
  });
});

describe('cantidades', () => {
  it('se muestran de forma corta', () => {
    expect(formatQuantity(1, null)).toBe('');
    expect(formatQuantity(3, null)).toBe('×3');
    expect(formatQuantity(1.5, 'kg')).toBe('1,5 kg');
    expect(formatQuantity(1, 'paquete')).toBe('1 paquete');
    expect(formatQuantity(2, 'paquete')).toBe('2 paquetes');
  });
  it('se validan', () => {
    expect(parseQuantity('2,5')).toBe(2.5);
    expect(parseQuantity('0')).toBeNull();
    expect(parseQuantity('abc')).toBeNull();
    expect(parseQuantity('100000')).toBeNull();
  });
});

describe('guessCategory', () => {
  it('por palabras clave', () => {
    expect(guessCategory('Leche desnatada')).toBe('lacteos');
    expect(guessCategory('Huevos')).toBe('lacteos');
    expect(guessCategory('Plátanos')).toBe('fruta');
    expect(guessCategory('Pechuga de pollo')).toBe('carne');
    expect(guessCategory('Pan de molde')).toBe('panaderia');
    expect(guessCategory('Tomate frito')).toBe('despensa');
    expect(guessCategory('Papel higiénico')).toBe('higiene');
    expect(guessCategory('Pasta de dientes')).toBe('higiene');
    expect(guessCategory('Macarrones')).toBe('despensa');
    expect(guessCategory('Cerveza')).toBe('bebidas');
    expect(guessCategory('Aguacates')).toBe('fruta');
    expect(guessCategory('Pizza congelada')).toBe('congelados');
    expect(guessCategory('Lejía')).toBe('limpieza');
    expect(guessCategory('Pañales')).toBe('higiene');
  });
  it('lo desconocido va a Otros y las palabras cortas no confunden', () => {
    expect(guessCategory('Pilas')).toBe('otros');
    expect(guessCategory('Pantalón')).toBe('otros');
    expect(guessCategory('')).toBe('otros');
  });
  it('recuerda la categoría que elegisteis para ese producto', () => {
    const history = [bought('Leche', '2026-09-01T10:00:00Z', { category: 'bebidas' })];
    expect(guessCategory('leche', history)).toBe('bebidas');
  });
});

describe('lista', () => {
  it('detecta un producto ya pendiente aunque cambien tildes o mayúsculas', () => {
    const items = [item({ name: 'Café molido' }), bought('Pan', '2026-09-01T10:00:00Z')];
    expect(pendingMatch(items, 'cafe  MOLIDO')?.name).toBe('Café molido');
    expect(pendingMatch(items, 'pan')).toBeUndefined();
  });
  it('pendientes: importantes primero y luego lo último apuntado', () => {
    const a = item({ name: 'A' });
    const b = item({ name: 'B' });
    const c = item({ name: 'C', important: true });
    expect(sortPending([a, b, c]).map((i) => i.name)).toEqual(['C', 'B', 'A']);
  });
  it('progreso de la compra en curso (lo de compras terminadas no cuenta)', () => {
    const items = [
      item({}), item({}),
      item({ status: 'bought', bought_at: '2026-10-01T11:00:00Z' }),
      bought('Viejo', '2026-09-01T10:00:00Z'),
    ];
    expect(tripProgress(items)).toEqual({ pending: 2, bought: 1, total: 3 });
    expect(currentBought(items)).toHaveLength(1);
  });
});

describe('recientes y habituales', () => {
  const history = [
    bought('Leche', '2026-09-01T10:00:00Z'),
    bought('leche', '2026-09-08T10:00:00Z', { quantity: 6 }),
    bought('Leche', '2026-09-15T10:00:00Z', { quantity: 6, unit: 'ud' }),
    bought('Pan', '2026-09-02T10:00:00Z'),
    bought('Pan', '2026-09-20T10:00:00Z'),
    bought('Huevos', '2026-09-03T10:00:00Z'),
    bought('Huevos', '2026-09-04T10:00:00Z'),
    bought('Kiwis', '2026-09-30T10:00:00Z'),
    bought('Sal', '2026-08-01T10:00:00Z'),
    item({ name: 'Pendiente' }),
  ];
  it('habituales por veces y luego por lo más reciente; recientes sin repetirlos', () => {
    const { frequent, recent } = frequentAndRecent(history);
    expect(frequent.map((p) => [p.name, p.count])).toEqual([['Leche', 3], ['Pan', 2], ['Huevos', 2]]);
    expect(recent.map((p) => p.name)).toEqual(['Kiwis', 'Sal']);
  });
  it('al volver a añadir se usa lo de la última vez', () => {
    const leche = frequentAndRecent(history).frequent[0];
    expect(leche.last.quantity).toBe(6);
    expect(leche.last.unit).toBe('ud');
  });
  it('sin historial no hay nada', () => {
    expect(frequentAndRecent([item({})])).toEqual({ frequent: [], recent: [] });
  });
  it('sugiere nombres al escribir, primero los que empiezan igual', () => {
    const h = [...history, bought('Mantequilla sin sal', '2026-09-05T10:00:00Z')];
    expect(suggestNames(h, 'sa').map((p) => p.name)).toEqual(['Sal', 'Mantequilla sin sal']);
    expect(suggestNames(h, 'pan')).toEqual([]);
  });
});

describe('búsqueda', () => {
  it('por nombre sin tildes y por categoría', () => {
    expect(matchesFilter('Plátanos de Canarias', 'fruta', { text: 'platanos canarias', category: '' })).toBe(true);
    expect(matchesFilter('Plátanos', 'fruta', { text: '', category: 'lacteos' })).toBe(false);
    expect(matchesFilter('Leche', 'lacteos', { text: 'lec', category: 'lacteos' })).toBe(true);
  });
});
