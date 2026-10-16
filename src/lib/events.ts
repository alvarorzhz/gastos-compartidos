import { balanceFor } from './balance';
import { formatShortDay } from './dates';
import type { Expense, TripEvent } from './types';

/**
 * Viaje o evento en curso hoy (empezó y no ha terminado), para apuntar en él los gastos
 * nuevos sin tener que elegirlo. Si hay varios, el más reciente.
 */
export function currentEvent(events: TripEvent[], todayIso: string): TripEvent | null {
  return (
    events
      .filter((e) => !e.archived && e.starts_on != null && e.starts_on <= todayIso && (e.ends_on == null || e.ends_on >= todayIso))
      .sort((a, b) => b.starts_on!.localeCompare(a.starts_on!) || b.created_at.localeCompare(a.created_at))[0] ?? null
  );
}

export interface EventSummary {
  expenses: Expense[];
  totalCents: number;
  /** Lo que pagó cada persona en este viaje. */
  paidBy: Map<string, number>;
  /** Saldo solo de este viaje desde el punto de vista de `me` (positivo = te deben). */
  balanceCents: number;
}

export function eventSummary(eventId: string, expenses: Expense[], me: string): EventSummary {
  const list = expenses.filter((e) => e.event_id === eventId);
  const paidBy = new Map<string, number>();
  let totalCents = 0;
  for (const e of list) {
    totalCents += e.amount_cents;
    paidBy.set(e.paid_by, (paidBy.get(e.paid_by) ?? 0) + e.amount_cents);
  }
  return { expenses: list, totalCents, paidBy, balanceCents: balanceFor(me, list, []) };
}

/** "1 nov – 5 nov", "Desde 1 nov" o "" si no tiene fechas. */
export function eventDates(e: Pick<TripEvent, 'starts_on' | 'ends_on'>, todayIso?: string): string {
  if (e.starts_on && e.ends_on) {
    return e.starts_on === e.ends_on ? formatShortDay(e.starts_on, todayIso) : `${formatShortDay(e.starts_on, todayIso)} – ${formatShortDay(e.ends_on, todayIso)}`;
  }
  if (e.starts_on) return `Desde ${formatShortDay(e.starts_on, todayIso)}`;
  if (e.ends_on) return `Hasta ${formatShortDay(e.ends_on, todayIso)}`;
  return '';
}

/** Viajes que se pueden elegir al apuntar un gasto: los no archivados, más el que ya tenga. */
export function selectableEvents(events: TripEvent[], selectedId: string | null | undefined): TripEvent[] {
  return events.filter((e) => !e.archived || e.id === selectedId);
}
