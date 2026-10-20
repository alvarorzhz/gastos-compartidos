import { knownMerchant } from './receipt';
import { normalize } from './search';
import { boughtHistory, sameProduct, type ShoppingItem } from './shopping';
import type { Expense } from './types';

/*
 * Dónde sale más barato: con los precios de los tickets (cada producto comprado queda enlazado
 * al gasto de la compra, y el concepto del gasto es la tienda) se compara lo que costó cada
 * producto en cada tienda.
 */

/** Precios más viejos que esto no se comparan: los precios cambian. */
export const MAX_AGE_DAYS = 180;
/** Por debajo de esto no merece la pena avisar (céntimos por la cantidad de la lista). */
const MIN_SAVING_CENTS = 5;

export interface StorePrice {
  store: string;
  /** Precio por unidad de la cantidad (por kg, por litro, por paquete o por unidad). */
  unitCents: number;
  /** Fecha de la compra (ISO). */
  boughtAt: string;
}

export interface CheaperElsewhere {
  /** Tienda donde salió más barato. */
  store: string;
  /** Lo que costaría allí la cantidad de la lista. */
  cents: number;
  /** Tienda de la última compra y lo que costaría allí. */
  usualStore: string;
  usualCents: number;
  savingCents: number;
}

/**
 * Nombre de la tienda de un gasto de la compra: el de las tiendas conocidas ("MERCADONA S.A." →
 * "Mercadona") o el concepto tal cual. null si el gasto no tiene concepto.
 */
export function storeName(note: string | null): string | null {
  const t = (note ?? '').replace(/\s+/g, ' ').trim();
  if (!t) return null;
  const known = knownMerchant(normalize(t));
  if (known) return known.name;
  const short = t.slice(0, 30);
  return short === short.toUpperCase() ? short.charAt(0) + short.slice(1).toLowerCase() : short;
}

/**
 * Último precio de un producto en cada tienda, del más barato al más caro. Solo cuenta lo
 * comprado con la misma medida (no se compara un kilo con un paquete).
 */
export function pricesByStore(
  product: Pick<ShoppingItem, 'name' | 'unit'>,
  items: ShoppingItem[],
  expenses: Expense[],
  now = new Date(),
): StorePrice[] {
  const noteOf = new Map(expenses.map((e) => [e.id, e.note]));
  const oldest = new Date(now.getTime() - MAX_AGE_DAYS * 86400000).toISOString();
  const byStore = new Map<string, StorePrice>();
  // boughtHistory va de lo más reciente a lo más antiguo: la primera vez que sale una tienda es su último precio.
  for (const i of boughtHistory(items)) {
    if (i.price_cents == null || i.price_cents <= 0 || !i.expense_id || !i.bought_at) continue;
    if (i.bought_at < oldest || (i.unit ?? null) !== (product.unit ?? null) || !(Number(i.quantity) > 0)) continue;
    if (!sameProduct(i.name, product.name)) continue;
    const store = storeName(noteOf.get(i.expense_id) ?? null);
    if (!store) continue;
    const key = normalize(store);
    if (byStore.has(key)) continue;
    byStore.set(key, { store, unitCents: i.price_cents / Number(i.quantity), boughtAt: i.bought_at });
  }
  return [...byStore.values()].sort((a, b) => a.unitCents - b.unitCents || a.store.localeCompare(b.store, 'es'));
}

/**
 * Si un producto de la lista salió más barato en otra tienda que en la de la última compra:
 * dónde, cuánto costaría allí y cuánto se ahorra. null si no hay con qué comparar o no compensa.
 */
export function cheaperElsewhere(
  item: Pick<ShoppingItem, 'name' | 'unit' | 'quantity'>,
  items: ShoppingItem[],
  expenses: Expense[],
  now = new Date(),
): CheaperElsewhere | null {
  const prices = pricesByStore(item, items, expenses, now);
  if (prices.length < 2) return null;
  const usual = [...prices].sort((a, b) => b.boughtAt.localeCompare(a.boughtAt))[0];
  const best = prices[0];
  if (best === usual) return null;
  const qty = Number(item.quantity) > 0 ? Number(item.quantity) : 1;
  const cents = Math.round(best.unitCents * qty);
  const usualCents = Math.round(usual.unitCents * qty);
  const savingCents = usualCents - cents;
  if (savingCents < MIN_SAVING_CENTS) return null;
  return { store: best.store, cents, usualStore: usual.store, usualCents, savingCents };
}

export interface StoreSaving {
  store: string;
  /** Productos de la lista que salieron más baratos en esta tienda. */
  count: number;
  savingCents: number;
}

/** Tiendas donde la lista pendiente saldría más barata, de la que más ahorra a la que menos. */
export function listSavingsByStore(items: ShoppingItem[], expenses: Expense[], now = new Date()): StoreSaving[] {
  const byStore = new Map<string, StoreSaving>();
  for (const i of items) {
    if (i.status !== 'pending') continue;
    const c = cheaperElsewhere(i, items, expenses, now);
    if (!c) continue;
    const s = byStore.get(c.store) ?? { store: c.store, count: 0, savingCents: 0 };
    s.count++;
    s.savingCents += c.savingCents;
    byStore.set(c.store, s);
  }
  return [...byStore.values()].sort((a, b) => b.savingCents - a.savingCents || b.count - a.count);
}

export interface ProductComparison {
  name: string;
  unit: ShoppingItem['unit'];
  prices: StorePrice[];
}

/**
 * Todos los productos comprados en al menos dos tiendas, con su precio en cada una. Primero
 * los que más cambian de precio de una tienda a otra.
 */
export function compareProducts(items: ShoppingItem[], expenses: Expense[], now = new Date()): ProductComparison[] {
  const seen: ProductComparison[] = [];
  for (const i of boughtHistory(items)) {
    if (i.price_cents == null || !i.expense_id) continue;
    if (seen.some((p) => p.unit === (i.unit ?? null) && sameProduct(p.name, i.name))) continue;
    seen.push({ name: i.name, unit: i.unit ?? null, prices: pricesByStore(i, items, expenses, now) });
  }
  const spread = (p: ProductComparison) => p.prices[p.prices.length - 1].unitCents / p.prices[0].unitCents;
  return seen.filter((p) => p.prices.length >= 2).sort((a, b) => spread(b) - spread(a) || a.name.localeCompare(b.name, 'es'));
}
