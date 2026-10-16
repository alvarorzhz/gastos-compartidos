import { addDays } from './dates';
import { normalize } from './search';
import type { Expense } from './types';

/** Gasto habitual: algo que apuntáis a menudo (el café, la gasolina, el súper). */
export interface Habitual {
  key: string;
  note: string | null;
  categoryId: string;
  /** Importe de la última vez. */
  amountCents: number;
  count: number;
  /** El gasto más reciente de este tipo, para copiar el reparto. */
  last: Expense;
}

/**
 * Gastos que se repiten (mismo concepto y categoría) en los últimos `days` días, de más a
 * menos frecuente. Los gastos fijos no cuentan: ya se apuntan solos.
 */
export function habituals(expenses: Expense[], todayIso: string, { days = 90, min = 2, limit = 6 } = {}): Habitual[] {
  const since = addDays(todayIso, -days);
  const groups = new Map<string, Habitual>();
  for (const e of expenses) {
    if (e.recurring_id || e.spent_on < since || e.spent_on > todayIso) continue;
    const key = normalize(e.note ?? '') + '|' + e.category_id;
    const g = groups.get(key);
    if (!g) {
      groups.set(key, { key, note: e.note, categoryId: e.category_id, amountCents: e.amount_cents, count: 1, last: e });
      continue;
    }
    g.count++;
    if (e.spent_on > g.last.spent_on || (e.spent_on === g.last.spent_on && e.created_at > g.last.created_at)) {
      g.last = e;
      g.amountCents = e.amount_cents;
      g.note = e.note;
    }
  }
  return [...groups.values()]
    .filter((g) => g.count >= min)
    .sort((a, b) => b.count - a.count || b.last.spent_on.localeCompare(a.last.spent_on))
    .slice(0, limit);
}
