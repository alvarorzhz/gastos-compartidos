import type { Expense, Settlement } from './types';

/**
 * Saldo entre las dos personas con reparto 50/50.
 *
 * Devuelve, en céntimos, cuánto le debe la otra persona a `me`.
 * Positivo: la otra persona te debe. Negativo: tú le debes.
 *
 * Cada gasto pagado por X hace que la otra persona deba la mitad a X.
 * Cada reembolso de X a Y reduce lo que X debe a Y (o aumenta lo que Y debe a X).
 * El resultado puede tener medio céntimo; se redondea solo al mostrarlo.
 */
export function balanceFor(me: string, expenses: Expense[], settlements: Settlement[]): number {
  let owedToMe = 0;
  for (const e of expenses) {
    owedToMe += e.paid_by === me ? e.amount_cents / 2 : -e.amount_cents / 2;
  }
  for (const s of settlements) {
    if (s.from_user === me) owedToMe += s.amount_cents;
    else if (s.to_user === me) owedToMe -= s.amount_cents;
  }
  return owedToMe;
}

/** Efecto de un gasto en el saldo de `me` (para mostrarlo en el historial). */
export function expenseEffect(me: string, e: Expense): number {
  return e.paid_by === me ? e.amount_cents / 2 : -e.amount_cents / 2;
}

/** Efecto de un reembolso en el saldo de `me`. */
export function settlementEffect(me: string, s: Settlement): number {
  if (s.from_user === me) return s.amount_cents;
  if (s.to_user === me) return -s.amount_cents;
  return 0;
}

export function totalPaidBy(user: string, expenses: Expense[]): number {
  return expenses.reduce((sum, e) => (e.paid_by === user ? sum + e.amount_cents : sum), 0);
}
