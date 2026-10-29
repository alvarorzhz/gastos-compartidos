import { addDays } from './dates';
import { normalize } from './search';
import type { Expense } from './types';

/*
 * Gastos repetidos.
 *
 * Pasa a veces que un mismo pago se apunta dos veces: con Apple Pay y luego con el ticket, o
 * cada uno de los dos por su lado, o el fijo que se apunta solo y alguien a mano. Se consideran
 * repetidos dos gastos con el mismo importe, con como mucho 2 días de diferencia y que, además,
 * o los apuntó cada uno de los dos, o tienen un concepto parecido (o uno no tiene concepto).
 * Los importes pequeños (menos de 3 €) no se miran, porque repetirlos es lo normal. La app solo
 * pregunta: «No son el mismo» descarta esa pareja para siempre.
 */

export interface DuplicatePair {
  /** El que se propone conservar (el que tiene más información). */
  keep: Expense;
  /** El que sobraría. */
  drop: Expense;
}

/** Lo que se mira hacia atrás: más allá ya no merece la pena preguntar. */
const LOOKBACK_DAYS = 60;
const MAX_GAP_DAYS = 2;
/** Por debajo de esto (un café, el pan) repetir importe es lo normal. */
const MIN_CENTS = 300;

export const pairKey = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);

const words = (note: string | null) => normalize(note ?? '').split(/[^a-z0-9ñ]+/).filter((w) => w.length >= 3);

/** ¿Parecen el mismo concepto? «MERCADONA VALENCIA» y «Mercadona» sí; «Cena» y «Gasolina» no. */
export function similarNotes(a: string | null, b: string | null): boolean {
  const wa = words(a);
  const wb = words(b);
  if (wa.length === 0 || wb.length === 0) return true;
  return wa.some((w) => wb.includes(w));
}

/** Cuánta información tiene un gasto, para quedarse con el más completo. */
function richness(e: Expense): number {
  return (e.note?.trim() ? 2 : 0) + (e.event_id ? 1 : 0) + (e.recurring_id ? 1 : 0) + (e.owed_cents != null ? 1 : 0);
}

/** Parejas de gastos que parecen el mismo, de la más reciente a la más antigua. Cada gasto sale como mucho una vez. */
export function findDuplicates(expenses: Expense[], todayIso: string, dismissed: Set<string>): DuplicatePair[] {
  const since = addDays(todayIso, -LOOKBACK_DAYS);
  const recent = expenses
    .filter((e) => e.spent_on >= since && e.amount_cents >= MIN_CENTS)
    .sort((a, b) => (a.spent_on < b.spent_on ? 1 : a.spent_on > b.spent_on ? -1 : a.created_at < b.created_at ? 1 : -1));
  const used = new Set<string>();
  const pairs: DuplicatePair[] = [];
  for (let i = 0; i < recent.length; i++) {
    const a = recent[i];
    if (used.has(a.id)) continue;
    for (let j = i + 1; j < recent.length; j++) {
      const b = recent[j];
      if (b.spent_on < addDays(a.spent_on, -MAX_GAP_DAYS)) break;
      if (used.has(b.id) || b.amount_cents !== a.amount_cents) continue;
      if (dismissed.has(pairKey(a.id, b.id))) continue;
      // El mismo fijo nunca se repite a sí mismo en dos días: son periodos distintos.
      if (a.recurring_id && a.recurring_id === b.recurring_id) continue;
      const byBoth = a.created_by != null && b.created_by != null && a.created_by !== b.created_by;
      if (!byBoth && !similarNotes(a.note, b.note)) continue;
      const [keep, drop] = richness(b) > richness(a) ? [b, a] : [a, b];
      pairs.push({ keep, drop });
      used.add(a.id).add(b.id);
      break;
    }
  }
  return pairs;
}

const DISMISSED_KEY = 'gastos.noRepetidos';

/** Parejas que alguien marcó como «No son el mismo» en este móvil. */
export function dismissedDuplicates(): Set<string> {
  try {
    const raw = JSON.parse(localStorage.getItem(DISMISSED_KEY) ?? '[]');
    return new Set(Array.isArray(raw) ? raw.filter((x): x is string => typeof x === 'string') : []);
  } catch {
    return new Set();
  }
}

export function dismissDuplicate(key: string): void {
  try {
    const next = [...dismissedDuplicates(), key].slice(-200);
    localStorage.setItem(DISMISSED_KEY, JSON.stringify(next));
  } catch {
    // Sin almacenamiento: se volverá a preguntar, sin más.
  }
}

/** Lo que le falta al que se queda y tiene el que se quita (concepto, viaje), para no perderlo al unir. */
export function mergedFields(keep: Expense, drop: Expense): Partial<Pick<Expense, 'note' | 'event_id'>> {
  const fields: Partial<Pick<Expense, 'note' | 'event_id'>> = {};
  if (!keep.note?.trim() && drop.note?.trim()) fields.note = drop.note;
  if (!keep.event_id && drop.event_id) fields.event_id = drop.event_id;
  return fields;
}
