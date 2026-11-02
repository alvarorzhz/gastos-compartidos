import { addDays, addMonths, monthOf } from './dates';
import { recurringDate } from './recurring';
import type { Expense, RecurringExpense } from './types';

/*
 * Calendario del mes: lo gastado cada día (con un color más intenso cuanto más se gastó)
 * y los gastos fijos que aún están por llegar.
 */

export interface DayTotal {
  cents: number;
  count: number;
}

export interface UpcomingFixed {
  id: string;
  note: string | null;
  cents: number;
  categoryId: string;
}

/** Semanas del mes (de lunes a domingo), con los días de los meses de al lado para completarlas. */
export function monthGrid(month: string): string[][] {
  const first = monthOf(month);
  const [y, m] = first.split('-').map(Number);
  const weekday = (new Date(y, m - 1, 1).getDay() + 6) % 7; // 0 = lunes
  const last = addDays(addMonths(first, 1), -1);
  const weeks: string[][] = [];
  let day = addDays(first, -weekday);
  while (day <= last) {
    const week: string[] = [];
    for (let i = 0; i < 7; i++) {
      week.push(day);
      day = addDays(day, 1);
    }
    weeks.push(week);
  }
  return weeks;
}

/** Total gastado y número de gastos de cada día del mes. */
export function dayTotals(expenses: Expense[], month: string): Map<string, DayTotal> {
  const m = monthOf(month);
  const totals = new Map<string, DayTotal>();
  for (const e of expenses) {
    if (monthOf(e.spent_on) !== m) continue;
    const t = totals.get(e.spent_on) ?? { cents: 0, count: 0 };
    t.cents += e.amount_cents;
    t.count += 1;
    totals.set(e.spent_on, t);
  }
  return totals;
}

/**
 * Intensidad del color de un día, de 0 (nada) a 4 (el día que más). Con raíz cuadrada para que
 * un gasto enorme (el alquiler) no deje el resto de días casi en blanco.
 */
export function heatLevel(cents: number, maxCents: number): 0 | 1 | 2 | 3 | 4 {
  if (cents <= 0 || maxCents <= 0) return 0;
  const level = Math.ceil(Math.sqrt(Math.min(1, cents / maxCents)) * 4);
  return Math.max(1, Math.min(4, level)) as 1 | 2 | 3 | 4;
}

/** Gastos fijos activos que se apuntarán desde hoy hasta el final del mes, por día. */
export function upcomingFixed(recurring: RecurringExpense[], month: string, todayIso: string): Map<string, UpcomingFixed[]> {
  const first = monthOf(month);
  const last = addDays(addMonths(first, 1), -1);
  const out = new Map<string, UpcomingFixed[]>();
  if (last < todayIso) return out;
  for (const r of recurring) {
    if (!r.active) continue;
    // Las repeticiones que faltan, desde la próxima; como mucho las de un mes (semanales: 5).
    for (let n = r.generated_count; n < r.generated_count + 60; n++) {
      const date = recurringDate(r.start_on, r.frequency, n);
      if (date > last) break;
      if (date < first || date < todayIso) continue;
      const list = out.get(date) ?? [];
      list.push({ id: r.id, note: r.note, cents: r.amount_cents, categoryId: r.category_id });
      out.set(date, list);
    }
  }
  return out;
}

export interface CalendarStats {
  /** Días ya pasados (hasta hoy) en los que no se gastó nada. */
  quietDays: number;
  /** Días que se cuentan (todo el mes si ya pasó; hasta hoy si es el actual). */
  daysCounted: number;
  busiest: { date: string; cents: number } | null;
  /** Media por día de los días contados. */
  perDayCents: number;
}

export function calendarStats(totals: Map<string, DayTotal>, month: string, todayIso: string): CalendarStats {
  const first = monthOf(month);
  const last = addDays(addMonths(first, 1), -1);
  const end = last < todayIso ? last : todayIso;
  let daysCounted = 0;
  let quietDays = 0;
  let spent = 0;
  for (let d = first; d <= end; d = addDays(d, 1)) {
    daysCounted++;
    const cents = totals.get(d)?.cents ?? 0;
    if (cents === 0) quietDays++;
    spent += cents;
  }
  let busiest: CalendarStats['busiest'] = null;
  for (const [date, t] of totals) {
    if (!busiest || t.cents > busiest.cents) busiest = { date, cents: t.cents };
  }
  return { quietDays, daysCounted, busiest, perDayCents: daysCounted > 0 ? Math.round(spent / daysCounted) : 0 };
}

/** Importe corto para la casilla del día: "54", "1,2 mil". */
export function shortEuros(cents: number): string {
  const euros = cents / 100;
  if (euros >= 1000) return (Math.round(euros / 100) / 10).toLocaleString('es-ES') + ' mil';
  if (euros >= 10) return String(Math.round(euros));
  return euros.toLocaleString('es-ES', { maximumFractionDigits: 1 });
}
