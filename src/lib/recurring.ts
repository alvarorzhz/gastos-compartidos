import { toIsoDate } from './dates';
import type { Frequency, RecurringExpense } from './types';

export const FREQUENCIES: { id: Frequency; label: string; every: string }[] = [
  { id: 'weekly', label: 'Semanal', every: 'cada semana' },
  { id: 'monthly', label: 'Mensual', every: 'cada mes' },
  { id: 'yearly', label: 'Anual', every: 'cada año' },
];

export function frequencyText(f: Frequency): string {
  return FREQUENCIES.find((x) => x.id === f)!.every;
}

/**
 * Fecha de la repetición n (0 = la primera), igual que recurring_date en la base de datos:
 * los meses conservan el día y, si no existe, usan el último del mes (31 ene → 28 feb → 31 mar).
 */
export function recurringDate(start: string, frequency: Frequency, n: number): string {
  const [y, m, d] = start.split('-').map(Number);
  if (frequency === 'weekly') return toIsoDate(new Date(y, m - 1, d + 7 * n));
  const months = frequency === 'monthly' ? n : 12 * n;
  const lastDay = new Date(y, m - 1 + months + 1, 0).getDate();
  return toIsoDate(new Date(y, m - 1 + months, Math.min(d, lastDay)));
}

/** Próxima fecha en la que se apuntará el gasto fijo. */
export function nextDate(r: RecurringExpense): string {
  return recurringDate(r.start_on, r.frequency, r.generated_count);
}

/** Lo que suma al mes de media, para comparar gastos fijos con distinta frecuencia. */
export function monthlyEquivalent(r: Pick<RecurringExpense, 'amount_cents' | 'frequency'>): number {
  if (r.frequency === 'weekly') return (r.amount_cents * 52) / 12;
  if (r.frequency === 'yearly') return r.amount_cents / 12;
  return r.amount_cents;
}
