import { centsToInput, parseEuros } from './money';
import type { Expense } from './types';

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

/** Las tres formas de repartir que se eligen en el formulario (más la de un gasto antiguo raro). */
export type SplitChoice = 'equal' | 'mine' | 'theirs' | 'custom';

export const HALF: SplitState = { mode: 'equal', myShare: '50' };

/** Qué opción del formulario corresponde a un reparto: todo mío (100 %), todo suyo (0 %) o a medias. */
export function choiceOf(split: SplitState): SplitChoice {
  if (split.mode === 'equal') return 'equal';
  if (split.mode === 'percent') {
    const p = Number(split.myShare.trim().replace(',', '.'));
    if (p === 50) return 'equal';
    if (p === 100) return 'mine';
    if (p === 0) return 'theirs';
  }
  return 'custom';
}

export function splitForChoice(choice: Exclude<SplitChoice, 'custom'>): SplitState {
  return choice === 'equal' ? HALF : { mode: 'percent', myShare: choice === 'mine' ? '100' : '0' };
}

/** Para un gasto nuevo solo valen las tres opciones: un reparto raro de otras veces pasa a medias. */
export function simpleSplit(split: SplitState): SplitState {
  const choice = choiceOf(split);
  return choice === 'custom' ? HALF : splitForChoice(choice);
}

/** Estado inicial del formulario a partir de un gasto (o gasto fijo) guardado. */
export function splitFromExpense(e: Pick<Expense, 'amount_cents' | 'paid_by' | 'owed_cents'> | null | undefined, me: string): SplitState {
  if (!e || e.owed_cents == null) return { mode: 'equal', myShare: '50' };
  const mine = e.paid_by === me ? e.amount_cents - e.owed_cents : e.owed_cents;
  const percent = (mine * 100) / e.amount_cents;
  if (Number.isInteger(percent)) return { mode: 'percent', myShare: String(percent) };
  return { mode: 'amount', myShare: centsToInput(mine) };
}
