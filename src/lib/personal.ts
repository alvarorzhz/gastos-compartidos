import { owedOf } from './balance';
import { monthOf } from './dates';
import type { Slice } from './stats';
import type { Expense, PersonalEntry } from './types';

export const PERSONAL_CATEGORIES: Record<PersonalEntry['kind'], string[]> = {
  expense: ['Ropa', 'Ocio', 'Comida fuera', 'Transporte', 'Suscripciones', 'Regalos', 'Salud', 'Cuidado personal', 'Otros'],
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

/** Gastos personales del mes por categoría, de mayor a menor. */
export function personalByCategory(entries: PersonalEntry[], month: string): Slice[] {
  const sums = new Map<string, number>();
  let total = 0;
  for (const e of entries) {
    if (e.kind !== 'expense' || monthOf(e.entry_on) !== month) continue;
    sums.set(e.category, (sums.get(e.category) ?? 0) + e.amount_cents);
    total += e.amount_cents;
  }
  return [...sums.entries()].map(([id, cents]) => ({ id, cents, share: cents / total })).sort((a, b) => b.cents - a.cents);
}
