import { monthOf } from './dates';
import { recurringDate } from './recurring';
import type { Expense, RecurringExpense } from './types';

/** A partir de este día del mes se enseña la previsión (antes hay muy pocos datos). */
export const FORECAST_FROM_DAY = 5;

export interface Forecast {
  /** Lo que se calcula que habréis gastado a fin de mes. */
  cents: number;
  /** Gastos fijos que aún se apuntarán este mes (ya incluidos en cents). */
  pendingFixedCents: number;
}

/**
 * Previsión del gasto del mes en curso: lo variable sigue al ritmo que lleva hasta hoy y
 * los gastos fijos cuentan por lo que son (los ya apuntados y los que faltan por llegar).
 * Devuelve null si el mes no es el actual o es demasiado pronto para estimar.
 */
export function monthForecast(todayIso: string, expenses: Expense[], recurring: RecurringExpense[]): Forecast | null {
  const month = monthOf(todayIso);
  const [y, m, day] = todayIso.split('-').map(Number);
  if (day < FORECAST_FROM_DAY) return null;
  const daysInMonth = new Date(y, m, 0).getDate();
  const monthEnd = `${month.slice(0, 8)}${String(daysInMonth).padStart(2, '0')}`;

  let known = 0; // gastos fijos y gastos con fecha futura: no se extrapolan
  let variableToDate = 0;
  for (const e of expenses) {
    if (monthOf(e.spent_on) !== month) continue;
    if (e.recurring_id || e.spent_on > todayIso) known += e.amount_cents;
    else variableToDate += e.amount_cents;
  }

  let pendingFixedCents = 0;
  for (const r of recurring) {
    if (!r.active) continue;
    for (let n = r.generated_count; n < r.generated_count + 40; n++) {
      const date = recurringDate(r.start_on, r.frequency, n);
      if (date > monthEnd) break;
      if (date > todayIso) pendingFixedCents += r.amount_cents;
    }
  }

  const cents = known + pendingFixedCents + (variableToDate / day) * daysInMonth;
  return { cents, pendingFixedCents };
}
