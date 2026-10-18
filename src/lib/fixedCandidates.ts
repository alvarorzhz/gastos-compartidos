import { addDays } from './dates';
import { recurringDate } from './recurring';
import { normalize } from './search';
import type { Expense, RecurringExpense } from './types';

/** Gasto que parece repetirse cada mes y todavía no es un gasto fijo. */
export interface FixedCandidate {
  key: string;
  note: string;
  categoryId: string;
  /** Importe de la última vez. */
  amountCents: number;
  /** La última vez que se apuntó, para copiar quién pagó y el reparto. */
  last: Expense;
  /** Meses seguidos en los que aparece. */
  months: number;
  /** Primera fecha que apuntaría el gasto fijo (siempre después de hoy). */
  startOn: string;
}

const monthIndex = (iso: string) => Number(iso.slice(0, 4)) * 12 + Number(iso.slice(5, 7)) - 1;

/**
 * Busca gastos con el mismo concepto que salen una vez al mes, al menos dos meses seguidos,
 * con un importe parecido y más o menos el mismo día (Netflix, la luz, el gimnasio…).
 * Lo que ya es un gasto fijo, lo descartado y lo que lleva más de 45 días sin aparecer no cuenta.
 */
export function fixedCandidates(
  expenses: Expense[],
  recurring: Pick<RecurringExpense, 'note'>[],
  todayIso: string,
  dismissed: ReadonlySet<string> = new Set(),
  limit = 5,
): FixedCandidate[] {
  const already = new Set(recurring.map((r) => normalize(r.note ?? '')).filter(Boolean));
  const since = addDays(todayIso, -400);
  const groups = new Map<string, Expense[]>();
  for (const e of expenses) {
    if (e.recurring_id || !e.note || e.spent_on < since || e.spent_on > todayIso) continue;
    const key = normalize(e.note);
    if (key.length < 3 || already.has(key) || dismissed.has(key)) continue;
    groups.set(key, [...(groups.get(key) ?? []), e]);
  }

  const out: FixedCandidate[] = [];
  for (const [key, list] of groups) {
    const sorted = [...list].sort((a, b) => a.spent_on.localeCompare(b.spent_on));
    const months = new Set(sorted.map((e) => monthIndex(e.spent_on)));
    // Una vez al mes: si en algún mes sale dos veces, es algo que se compra a menudo (el súper).
    if (months.size !== sorted.length || sorted.length < 2) continue;
    // Los dos últimos meses tienen que ir seguidos.
    const tail = sorted.slice(-3);
    const run = consecutiveTail(tail.map((e) => monthIndex(e.spent_on)));
    if (run < 2) continue;
    const recent = tail.slice(-run);
    const last = recent[recent.length - 1];
    if (last.spent_on < addDays(todayIso, -45)) continue;
    const amounts = recent.map((e) => e.amount_cents);
    if (Math.max(...amounts) > Math.min(...amounts) * 1.3) continue;
    const days = recent.map((e) => Number(e.spent_on.slice(8, 10)));
    if (Math.max(...days) - Math.min(...days) > 6) continue;

    let n = 1;
    while (recurringDate(last.spent_on, 'monthly', n) <= todayIso) n++;
    out.push({
      key,
      note: last.note!,
      categoryId: last.category_id,
      amountCents: last.amount_cents,
      last,
      months: run,
      startOn: recurringDate(last.spent_on, 'monthly', n),
    });
  }
  return out.sort((a, b) => b.amountCents - a.amountCents).slice(0, limit);
}

/** Cuántos de los últimos meses van seguidos (de uno en uno). */
function consecutiveTail(months: number[]): number {
  let run = 1;
  for (let i = months.length - 1; i > 0 && months[i] - months[i - 1] === 1; i--) run++;
  return run;
}

const DISMISSED_KEY = 'gastos.fijosDescartados';

/** Conceptos que alguien ya dijo que no quiere convertir en fijos (en este móvil). */
export function dismissedCandidates(): Set<string> {
  try {
    const raw = JSON.parse(localStorage.getItem(DISMISSED_KEY) ?? '[]');
    return new Set(Array.isArray(raw) ? raw.filter((x): x is string => typeof x === 'string') : []);
  } catch {
    return new Set();
  }
}

export function dismissCandidate(key: string): void {
  try {
    const next = [...dismissedCandidates(), key].slice(-200);
    localStorage.setItem(DISMISSED_KEY, JSON.stringify(next));
  } catch {
    // Sin almacenamiento: se volverá a proponer, sin más.
  }
}
