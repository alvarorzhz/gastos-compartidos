import { owedOf } from './balance';
import { monthOf } from './dates';
import { normalize } from './search';
import { guessPersonalCategory } from './statement';
import type { Expense, PersonalEntry } from './types';

export const PERSONAL_CATEGORIES: Record<PersonalEntry['kind'], string[]> = {
  expense: ['Supermercado', 'Comida fuera', 'Ropa', 'Ocio', 'Transporte', 'Electrónica', 'Compras online', 'Casa', 'Suscripciones', 'Regalos', 'Salud', 'Cuidado personal', 'Otros'],
  income: ['Nómina', 'Extra', 'Venta', 'Regalo', 'Intereses', 'Otros'],
};

export interface PersonalMonth {
  incomeCents: number;
  expenseCents: number;
  /** Ingresos menos gastos personales. */
  netCents: number;
}

export function personalMonth(entries: PersonalEntry[], month: string): PersonalMonth {
  let incomeCents = 0;
  let expenseCents = 0;
  for (const e of entries) {
    if (monthOf(e.entry_on) !== month) continue;
    if (e.kind === 'income') incomeCents += e.amount_cents;
    else expenseCents += e.amount_cents;
  }
  return { incomeCents, expenseCents, netCents: incomeCents - expenseCents };
}

/** Lo que te toca de los gastos comunes de ese mes (tu parte, pagaras tú o no). */
export function myCommonShare(me: string, expenses: Expense[], month: string): number {
  let cents = 0;
  for (const e of expenses) {
    if (monthOf(e.spent_on) !== month) continue;
    cents += e.paid_by === me ? e.amount_cents - owedOf(e) : owedOf(e);
  }
  return Math.round(cents);
}

/** Categorías para elegir: las de siempre más las que ya hayas usado, sin repetir. */
export function categoryOptions(entries: PersonalEntry[], kind: PersonalEntry['kind']): string[] {
  const used = entries.filter((e) => e.kind === kind).map((e) => e.category);
  return [...new Set([...PERSONAL_CATEGORIES[kind], ...used])];
}

/** Gasto apuntado en «Otros» que parece de otra categoría. */
export interface CategoryProposal {
  entry: PersonalEntry;
  category: string;
  /** Por qué: lo elegiste tú antes para el mismo concepto, o se reconoce la tienda. */
  reason: 'learned' | 'merchant';
}

/**
 * Busca gastos en «Otros» (o sin categoría) a los que les toca otra: primero lo que tú ya
 * elegiste para el mismo concepto en otro gasto; si no, la tienda reconocida por su nombre.
 * Lo que no se reconoce se queda como está.
 */
export function categoryProposals(entries: PersonalEntry[], dismissed: ReadonlySet<string> = new Set()): CategoryProposal[] {
  const isOther = (c: string) => ['otros', 'otro', ''].includes(normalize(c));
  const learned = new Map<string, { category: string; date: string }>();
  for (const e of entries) {
    if (e.kind !== 'expense' || !e.note || isOther(e.category)) continue;
    const key = normalize(e.note);
    const prev = learned.get(key);
    if (!prev || prev.date < e.entry_on) learned.set(key, { category: e.category, date: e.entry_on });
  }
  const out: CategoryProposal[] = [];
  for (const e of entries) {
    if (e.kind !== 'expense' || !e.note || !isOther(e.category) || dismissed.has(e.id)) continue;
    const mine = learned.get(normalize(e.note));
    if (mine) {
      out.push({ entry: e, category: mine.category, reason: 'learned' });
      continue;
    }
    const guess = guessPersonalCategory({ description: e.note, amountCents: -e.amount_cents, date: e.entry_on });
    if (!isOther(guess)) out.push({ entry: e, category: guess, reason: 'merchant' });
  }
  return out.sort((a, b) => a.category.localeCompare(b.category) || b.entry.entry_on.localeCompare(a.entry.entry_on));
}

const DISMISSED_KEY = 'gastos.categoriasDescartadas';

/** Gastos que dijiste que se quedan en «Otros» (en este móvil). */
export function dismissedProposals(): Set<string> {
  try {
    const raw = JSON.parse(localStorage.getItem(DISMISSED_KEY) ?? '[]');
    return new Set(Array.isArray(raw) ? raw.filter((x): x is string => typeof x === 'string') : []);
  } catch {
    return new Set();
  }
}

export function dismissProposals(ids: string[]): void {
  try {
    localStorage.setItem(DISMISSED_KEY, JSON.stringify([...dismissedProposals(), ...ids].slice(-1000)));
  } catch {
    // Sin almacenamiento: se volverán a proponer, sin más.
  }
}
