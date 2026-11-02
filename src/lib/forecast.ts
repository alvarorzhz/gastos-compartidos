import { monthOf } from './dates';
import { recurringDate } from './recurring';
import type { Expense, RecurringExpense } from './types';

/** A partir de este día del mes se enseña la previsión (antes hay muy pocos datos). */
export const FORECAST_FROM_DAY = 5;

/** Qué tal de fiable es una estimación: se enseña con su porqué. */
export type Reliability = 'low' | 'medium' | 'good';

export interface Forecast {
  /** Lo que se calcula que habréis gastado a fin de mes. */
  cents: number;
  /** Gastos fijos que aún se apuntarán este mes (ya incluidos en cents). */
  pendingFixedCents: number;
  /** De dónde sale la cifra, para explicarla. */
  day: number;
  daysInMonth: number;
  /** Gastos del día a día hasta hoy (lo único que se extrapola) y cuántos son. */
  variableCents: number;
  variableCount: number;
  /** Gastos fijos ya apuntados y gastos con fecha futura: cuentan tal cual. */
  knownCents: number;
  /** Los fijos que faltan, con su nombre y día. */
  pendingFixed: { note: string; cents: number; date: string }[];
  /** El gasto variable más grande si pesa mucho en el ritmo (más de un tercio). */
  bigOne: { note: string; cents: number } | null;
  reliability: Reliability;
  /** Por qué no es del todo fiable (vacío si lo es). */
  caveats: string[];
}

/** Gastos variables que hacen falta para que el ritmo diga algo. */
const MIN_VARIABLE = 5;

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
  let variableCount = 0;
  let biggest: Expense | null = null;
  for (const e of expenses) {
    if (monthOf(e.spent_on) !== month) continue;
    if (e.recurring_id || e.spent_on > todayIso) known += e.amount_cents;
    else {
      variableToDate += e.amount_cents;
      variableCount++;
      if (!biggest || e.amount_cents > biggest.amount_cents) biggest = e;
    }
  }

  const pendingFixed: Forecast['pendingFixed'] = [];
  for (const r of recurring) {
    if (!r.active) continue;
    for (let n = r.generated_count; n < r.generated_count + 40; n++) {
      const date = recurringDate(r.start_on, r.frequency, n);
      if (date > monthEnd) break;
      if (date > todayIso) pendingFixed.push({ note: r.note?.trim() || 'Gasto fijo', cents: r.amount_cents, date });
    }
  }
  pendingFixed.sort((a, b) => a.date.localeCompare(b.date));
  const pendingFixedCents = pendingFixed.reduce((s, f) => s + f.cents, 0);

  const bigOne = biggest && variableCount >= 2 && biggest.amount_cents > variableToDate / 3 ? { note: biggest.note?.trim() || 'un gasto', cents: biggest.amount_cents } : null;
  const caveats: string[] = [];
  if (day < 10) caveats.push(`Solo llevamos ${day} días de mes: un par de compras cambian mucho el ritmo.`);
  if (variableCount < MIN_VARIABLE) caveats.push(variableCount === 0 ? 'Aún no hay gastos del día a día este mes.' : `Solo hay ${variableCount} ${variableCount === 1 ? 'gasto' : 'gastos'} del día a día este mes.`);
  if (bigOne) caveats.push(`«${bigOne.note}» pesa mucho en el ritmo: si fue algo puntual, la previsión sale más alta de la cuenta.`);
  const reliability: Reliability = day < 10 || variableCount < MIN_VARIABLE ? 'low' : caveats.length > 0 || day < 20 ? 'medium' : 'good';

  const cents = known + pendingFixedCents + (variableToDate / day) * daysInMonth;
  return { cents, pendingFixedCents, day, daysInMonth, variableCents: variableToDate, variableCount, knownCents: known, pendingFixed, bigOne, reliability, caveats };
}
