import { normalize } from './search';
import type { SplitState } from './split';
import { guessCategory } from './statement';
import type { Category, Expense, Member } from './types';

/** Lo que la app propone para un gasto nuevo según su concepto. */
export interface Suggestion {
  categoryId: string | null;
  /** Quién suele pagarlo, si casi siempre es la misma persona. */
  paidBy: string | null;
  /** Reparto de la última vez (desde el punto de vista de quien apunta). */
  split: SplitState | null;
  /** 'history' = como otras veces; 'rules' = por el nombre del comercio. */
  from: 'history' | 'rules';
}

/**
 * Propone categoría, quién paga y reparto a partir de lo que ya habéis apuntado con un
 * concepto igual (o que empieza igual: "merc" → "Mercadona"). Si nunca se apuntó, prueba a
 * reconocer el comercio ("Repsol" → Transporte).
 */
export function suggestForNote(
  note: string,
  ctx: { expenses: Expense[]; categories: Pick<Category, 'id' | 'name' | 'archived'>[]; members: Member[]; me: string },
): Suggestion | null {
  const n = normalize(note);
  if (n.length < 3) return null;
  const active = new Set(ctx.categories.filter((c) => !c.archived).map((c) => c.id));
  const usable = ctx.expenses.filter((e) => e.note && active.has(e.category_id));

  let matches = usable.filter((e) => normalize(e.note!) === n);
  if (matches.length === 0) {
    // Lo escrito es el principio de un concepto conocido: se queda el más usado.
    const counts = new Map<string, Expense[]>();
    for (const e of usable) {
      const k = normalize(e.note!);
      if (k.startsWith(n)) counts.set(k, [...(counts.get(k) ?? []), e]);
    }
    matches = [...counts.values()].sort((a, b) => b.length - a.length)[0] ?? [];
  }

  if (matches.length > 0) {
    const recent = [...matches].sort((a, b) => b.spent_on.localeCompare(a.spent_on) || b.created_at.localeCompare(a.created_at)).slice(0, 10);
    const memberIds = new Set(ctx.members.map((m) => m.user_id));
    const payers = recent.filter((e) => memberIds.has(e.paid_by));
    const payer = mostCommon(payers.map((e) => e.paid_by));
    return {
      categoryId: mostCommon(recent.map((e) => e.category_id))!.value,
      // Solo si casi siempre paga la misma persona (2 de cada 3 veces o más).
      paidBy: payers.length >= 2 && payer && payer.count * 3 >= payers.length * 2 ? payer.value : null,
      split: shareOf(recent[0], ctx.me),
      from: 'history',
    };
  }

  const guessed = guessCategory(note);
  const category = guessed && ctx.categories.find((c) => !c.archived && normalize(c.name) === normalize(guessed));
  return category ? { categoryId: category.id, paidBy: null, split: null, from: 'rules' } : null;
}

/** El valor que más se repite; si hay empate, el que sale antes (el más reciente). */
function mostCommon<T>(values: T[]): { value: T; count: number } | null {
  const counts = new Map<T, number>();
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  let best: { value: T; count: number } | null = null;
  for (const v of values) {
    const count = counts.get(v)!;
    if (!best || count > best.count) best = { value: v, count };
  }
  return best;
}

/** Mi parte del gasto, en %, para copiarla aunque el importe sea otro. */
function shareOf(e: Expense, me: string): SplitState {
  if (e.owed_cents == null || e.amount_cents <= 0) return { mode: 'equal', myShare: '50' };
  const mine = e.paid_by === me ? e.amount_cents - e.owed_cents : e.owed_cents;
  const percent = Math.round((mine * 100) / e.amount_cents);
  return percent === 50 ? { mode: 'equal', myShare: '50' } : { mode: 'percent', myShare: String(percent) };
}
