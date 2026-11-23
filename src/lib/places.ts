import type { Category, Expense } from './types';

/**
 * Mapa de los gastos: al apuntar un gasto nuevo se guarda dónde estabais
 * (columnas lat/lng de la 0019) y aquí se agrupan por sitios.
 */

export interface Spot {
  lat: number;
  lng: number;
}

/** Cuatro decimales (unos 10 metros): basta para el mapa y no guarda la posición exacta. */
export function roundSpot(lat: number, lng: number): Spot | null {
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  const r = (n: number) => Math.round(n * 1e4) / 1e4;
  return { lat: r(lat), lng: r(lng) };
}

export type PlacedExpense = Expense & { lat: number; lng: number };

export function hasSpot(e: Expense): e is PlacedExpense {
  return typeof e.lat === 'number' && typeof e.lng === 'number';
}

/** Gastos con sitio; con `month` (AAAA-MM o AAAA-MM-01, como lo usa la app), solo los de ese mes. */
export function placedExpenses(expenses: Expense[], month?: string | null): PlacedExpense[] {
  const prefix = month?.slice(0, 7);
  return expenses.filter((e) => hasSpot(e) && (!prefix || e.spent_on.startsWith(prefix))) as PlacedExpense[];
}

export interface Place extends Spot {
  key: string;
  /** El concepto que más se repite ahí (o la categoría si no hay concepto). */
  name: string;
  count: number;
  cents: number;
  expenseIds: string[];
}

// Celdas de unos 150 m: lo que cae en la misma celda es «el mismo sitio».
const CELL_LAT = 0.0014;
const CELL_LNG = 0.0019;

/** Agrupa los gastos por sitios cercanos, de más a menos dinero. */
export function groupPlaces(expenses: PlacedExpense[], categories: Category[]): Place[] {
  const cells = new Map<string, PlacedExpense[]>();
  for (const e of expenses) {
    const key = `${Math.round(e.lat / CELL_LAT)}:${Math.round(e.lng / CELL_LNG)}`;
    const list = cells.get(key);
    if (list) list.push(e);
    else cells.set(key, [e]);
  }
  const catName = (id: string) => categories.find((c) => c.id === id)?.name ?? 'Otros';
  return [...cells.entries()]
    .map(([key, list]) => ({
      key,
      lat: list.reduce((s, e) => s + e.lat, 0) / list.length,
      lng: list.reduce((s, e) => s + e.lng, 0) / list.length,
      name: mostCommon(list.map((e) => e.note?.trim() || catName(e.category_id))),
      count: list.length,
      cents: list.reduce((s, e) => s + e.amount_cents, 0),
      expenseIds: list.map((e) => e.id),
    }))
    .sort((a, b) => b.cents - a.cents || b.count - a.count);
}

function mostCommon(names: string[]): string {
  const counts = new Map<string, { n: number; label: string }>();
  for (const name of names) {
    const k = name.toLocaleLowerCase('es');
    const c = counts.get(k);
    if (c) c.n++;
    else counts.set(k, { n: 1, label: name });
  }
  let best = { n: 0, label: '' };
  for (const c of counts.values()) if (c.n > best.n) best = c;
  return best.label;
}

/** Radio del círculo en el mapa: crece con el dinero, pero sin que uno grande tape todo. */
export function spotRadius(cents: number, maxCents: number): number {
  if (maxCents <= 0) return 8;
  return Math.round(7 + 17 * Math.sqrt(Math.max(0, cents) / maxCents));
}
