import { normalize } from './search';
import { boughtHistory, sameProduct, type ShoppingItem } from './shopping';
import type { ReceiptLine } from './receipt';
import { effectiveBudgets } from './budget';
import { monthOf } from './dates';
import type { Budget, Category, Expense } from './types';

/*
 * Precios de la compra: lo que costó cada producto la última vez, cuánto costará la lista
 * y qué línea del ticket corresponde a cada producto comprado.
 */

export interface LastPrice {
  cents: number;
  quantity: number;
  unit: ShoppingItem['unit'];
  boughtAt: string;
}

/** Último precio pagado por un producto (por nombre, sin mirar mayúsculas ni tildes). */
export function lastPrice(name: string, items: ShoppingItem[]): LastPrice | null {
  const last = boughtHistory(items).find((i) => i.price_cents != null && sameProduct(i.name, name));
  return last ? { cents: last.price_cents!, quantity: Number(last.quantity), unit: last.unit, boughtAt: last.bought_at ?? last.updated_at } : null;
}

/**
 * Lo que costará un producto de la lista: el precio aproximado que se le haya puesto o,
 * si no, el de la última vez ajustado a la cantidad (2 leches cuestan el doble que 1).
 */
export function itemEstimate(item: Pick<ShoppingItem, 'name' | 'quantity' | 'unit' | 'estimated_cents'>, items: ShoppingItem[]): number | null {
  if (item.estimated_cents != null) return item.estimated_cents;
  const last = lastPrice(item.name, items);
  if (!last) return null;
  if (last.unit === item.unit && last.quantity > 0) return Math.round((last.cents / last.quantity) * Number(item.quantity));
  return last.cents;
}

/** Cuánto costará lo que queda por comprar y de cuántos productos no se sabe el precio. */
export function listEstimate(items: ShoppingItem[]): { cents: number; priced: number; missing: number } {
  let cents = 0;
  let priced = 0;
  let missing = 0;
  for (const i of items) {
    if (i.status !== 'pending') continue;
    const e = itemEstimate(i, items);
    if (e == null) missing++;
    else {
      cents += e;
      priced++;
    }
  }
  return { cents, priced, missing };
}

const STOP = new Set(['de', 'del', 'la', 'el', 'los', 'las', 'con', 'sin', 'y', 'en', 'para', 'pack']);

function words(s: string): string[] {
  return normalize(s)
    .replace(/[^a-z0-9ñ ]+/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length >= 2 && !/^\d/.test(w) && !STOP.has(w))
    .map((w) => w.replace(/(es|s)$/, (m) => (w.length - m.length >= 3 ? '' : m)));
}

/** Parecido entre dos palabras: igual, o una empieza por la otra (los tickets abrevian: "TOST", "RELLEN"). */
function wordScore(a: string, b: string): number {
  if (a === b) return 1;
  const [short, long] = a.length <= b.length ? [a, b] : [b, a];
  if (short.length >= 3 && long.startsWith(short)) return 0.8;
  return 0;
}

/**
 * Cuánto se parece el nombre de la lista ("Aceitunas") a una línea del ticket
 * ("ACEITUNAS RELLEN"): de 0 a 1. Cuenta lo que se encuentra de cada palabra de la lista.
 */
export function nameScore(listName: string, ticketName: string): number {
  const a = words(listName);
  const b = words(ticketName);
  if (!a.length || !b.length) return 0;
  const found = a.reduce((sum, w) => sum + Math.max(0, ...b.map((x) => wordScore(w, x))), 0);
  return found / a.length;
}

export interface TicketMatch {
  itemId: string;
  line: number;
}

/**
 * Empareja cada producto comprado con una línea del ticket. Primero lo aprendido otras veces
 * (ese producto ya se llamó así en un ticket) y después por parecido del nombre. Cada línea
 * se usa una vez; lo que no se parece lo bastante se queda sin emparejar para que se elija a mano.
 */
export function matchTicket(bought: ShoppingItem[], lines: ReceiptLine[], history: ShoppingItem[]): TicketMatch[] {
  const learned = (item: ShoppingItem) =>
    history
      .filter((h) => h.ticket_name && h.id !== item.id && sameProduct(h.name, item.name))
      .map((h) => h.ticket_name!);
  const pairs: { itemId: string; line: number; score: number }[] = [];
  for (const item of bought) {
    const known = learned(item);
    lines.forEach((l, idx) => {
      if (l.cents <= 0) return;
      const fromHistory = Math.max(0, ...known.map((k) => (normalize(k) === normalize(l.name) ? 2 : nameScore(k, l.name) >= 0.9 ? 1.5 : 0)));
      const score = Math.max(fromHistory, nameScore(item.name, l.name));
      if (score >= 0.5) pairs.push({ itemId: item.id, line: idx, score });
    });
  }
  pairs.sort((a, b) => b.score - a.score || a.line - b.line);
  const usedItems = new Set<string>();
  const usedLines = new Set<number>();
  const out: TicketMatch[] = [];
  for (const p of pairs) {
    if (usedItems.has(p.itemId) || usedLines.has(p.line)) continue;
    usedItems.add(p.itemId);
    usedLines.add(p.line);
    out.push({ itemId: p.itemId, line: p.line });
  }
  return out;
}

/** "Anacardo tost 0% sal" a partir de "ANACARDO TOST 0% SAL", para enseñarlo más legible. */
export function prettyTicketName(name: string): string {
  const t = name.trim();
  return t === t.toUpperCase() ? t.charAt(0) + t.slice(1).toLowerCase() : t;
}

/**
 * Categoría de gasto de la compra: la del último gasto apuntado al terminar una compra; si no,
 * la que se llame como un súper ("Supermercado", "Compra", "Alimentación"); si no, la primera.
 */
export function shoppingCategory(categories: Category[], expenses: Expense[], items: ShoppingItem[]): Category | null {
  const active = categories.filter((c) => !c.archived);
  const linked = boughtHistory(items).find((i) => i.expense_id && expenses.some((e) => e.id === i.expense_id));
  const fromLast = linked && active.find((c) => c.id === expenses.find((e) => e.id === linked.expense_id)!.category_id);
  if (fromLast) return fromLast;
  return active.find((c) => /super|compra|aliment|comida/.test(normalize(c.name))) ?? active[0] ?? null;
}

/** Presupuesto de la categoría de la compra este mes: cuánto queda (en negativo, cuánto os habéis pasado). */
export function shoppingBudgetLeft(category: Category, expenses: Expense[], budgets: Budget[], todayIso: string): number | null {
  const month = monthOf(todayIso);
  const budget = effectiveBudgets(month, budgets).get(category.id);
  if (budget == null) return null;
  const spent = expenses.filter((e) => e.category_id === category.id && monthOf(e.spent_on) === month).reduce((a, e) => a + e.amount_cents, 0);
  return budget - spent;
}
