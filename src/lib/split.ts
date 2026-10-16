import { centsToInput, parseEuros } from './money';
import type { Expense, Household, Member } from './types';

export type SplitMode = 'equal' | 'percent' | 'amount';

export interface SplitState {
  mode: SplitMode;
  /** Mi parte: porcentaje ("60") o euros ("12,50") según el modo. */
  myShare: string;
}

/**
 * Convierte lo que se elige en el formulario en owed_cents (lo que debe quien no pagó).
 * Trabaja con "mi parte" para que la pregunta no dependa de quién pagó.
 * Devuelve null para 50/50 y 'invalid' si el valor no tiene sentido.
 */
export function owedFromSplit(split: SplitState, amountCents: number, payerIsMe: boolean): number | null | 'invalid' {
  if (split.mode === 'equal') return null;
  let mine: number;
  if (split.mode === 'percent') {
    const p = Number(split.myShare.trim().replace(',', '.'));
    if (split.myShare.trim() === '' || !Number.isFinite(p) || p < 0 || p > 100) return 'invalid';
    mine = Math.round((amountCents * p) / 100);
  } else {
    const cents = parseEuros(split.myShare, { allowZero: true });
    if (cents == null || cents > amountCents) return 'invalid';
    mine = cents;
  }
  return payerIsMe ? amountCents - mine : mine;
}

/** Porcentaje para mostrar: como mucho dos decimales y con coma (100 − 70,7 → "29,3"). */
export function formatPercent(p: number): string {
  return String(Math.round(p * 100) / 100).replace('.', ',');
}

/** Mi parte (%) de cada gasto nuevo según el reparto por defecto del espacio. */
export function defaultMyPercent(household: Pick<Household, 'default_split_user' | 'default_split_percent'>, me: string, members: Member[]): number {
  const { default_split_user: user, default_split_percent: p } = household;
  if (user == null || p == null || members.length < 2 || !members.some((m) => m.user_id === user)) return 50;
  return user === me ? p : 100 - p;
}

/** Reparto con el que empieza un gasto nuevo. */
export function defaultSplit(household: Pick<Household, 'default_split_user' | 'default_split_percent'>, me: string, members: Member[]): SplitState {
  const mine = defaultMyPercent(household, me, members);
  return mine === 50 ? { mode: 'equal', myShare: '50' } : { mode: 'percent', myShare: String(mine) };
}

/** Estado inicial del formulario a partir de un gasto (o gasto fijo) guardado. */
export function splitFromExpense(e: Pick<Expense, 'amount_cents' | 'paid_by' | 'owed_cents'> | null | undefined, me: string): SplitState {
  if (!e || e.owed_cents == null) return { mode: 'equal', myShare: '50' };
  const mine = e.paid_by === me ? e.amount_cents - e.owed_cents : e.owed_cents;
  const percent = (mine * 100) / e.amount_cents;
  if (Number.isInteger(percent)) return { mode: 'percent', myShare: String(percent) };
  return { mode: 'amount', myShare: centsToInput(mine) };
}
