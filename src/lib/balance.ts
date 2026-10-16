import type { Expense, Settlement } from './types';

/** Lo que la persona que no pagó debe a quien pagó: la mitad salvo reparto personalizado. */
export function owedOf(e: Expense): number {
  return e.owed_cents ?? e.amount_cents / 2;
}

/**
 * Saldo entre las dos personas.
 *
 * Devuelve, en céntimos, cuánto le debe la otra persona a `me`.
 * Positivo: la otra persona te debe. Negativo: tú le debes.
 *
 * Cada gasto pagado por X hace que la otra persona deba a X su parte
 * (la mitad por defecto, o lo indicado en owed_cents).
 * Cada reembolso de X a Y reduce lo que X debe a Y (o aumenta lo que Y debe a X).
 * El resultado puede tener medio céntimo; se redondea solo al mostrarlo.
 */
export function balanceFor(me: string, expenses: Expense[], settlements: Settlement[]): number {
  let owedToMe = 0;
  for (const e of expenses) owedToMe += expenseEffect(me, e);
  for (const s of settlements) {
    if (s.from_user === me) owedToMe += s.amount_cents;
    else if (s.to_user === me) owedToMe -= s.amount_cents;
  }
  return owedToMe;
}

/**
 * Redondea el saldo a céntimos alejándose del cero, para que los dos veáis la misma cifra:
 * con medio céntimo, Math.round daría 6,18 € a quien le deben y 6,17 € a quien debe.
 */
export function roundBalance(cents: number): number {
  return Math.sign(cents) * Math.round(Math.abs(cents)) + 0;
}

/** Efecto de un gasto en el saldo de `me` (para mostrarlo en el historial). */
export function expenseEffect(me: string, e: Expense): number {
  return e.paid_by === me ? owedOf(e) : -owedOf(e);
}

/** Efecto de un reembolso en el saldo de `me`. */
export function settlementEffect(me: string, s: Settlement): number {
  if (s.from_user === me) return s.amount_cents;
  if (s.to_user === me) return -s.amount_cents;
  return 0;
}

/** Lo que le corresponde pagar a `user` de todos los gastos (su parte, no lo que adelantó). */
export function shareOf(user: string, expenses: Expense[]): number {
  return expenses.reduce((sum, e) => sum + (e.paid_by === user ? e.amount_cents - owedOf(e) : owedOf(e)), 0);
}

export function totalPaidBy(user: string, expenses: Expense[]): number {
  return expenses.reduce((sum, e) => (e.paid_by === user ? sum + e.amount_cents : sum), 0);
}
