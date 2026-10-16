import { describe, expect, it } from 'vitest';
import { currentEvent, eventDates, eventSummary } from './events';
import type { Expense, TripEvent } from './types';

const ev = (id: string, starts_on: string | null, ends_on: string | null, archived = false): TripEvent => ({
  id, household_id: 'h', name: id, starts_on, ends_on, archived, created_by: 'a', created_at: '2026-10-01T10:00:00Z',
});
const exp = (id: string, paid_by: string, amount_cents: number, event_id: string | null): Expense => ({
  id, household_id: 'h', amount_cents, spent_on: '2026-11-02', category_id: 'c', paid_by, owed_cents: null, note: null,
  recurring_id: null, event_id, created_by: paid_by, created_at: '', updated_at: '',
});

describe('currentEvent', () => {
  const events = [ev('roma', '2026-11-01', '2026-11-05'), ev('boda', '2026-11-03', null), ev('viejo', '2026-11-01', '2026-11-30', true), ev('sin', null, null)];
  it('elige el viaje en curso más reciente', () => {
    expect(currentEvent(events, '2026-11-02')?.id).toBe('roma');
    expect(currentEvent(events, '2026-11-04')?.id).toBe('boda');
    expect(currentEvent(events, '2026-12-01')?.id).toBe('boda');
  });
  it('no elige nada fuera de fechas ni archivados', () => {
    expect(currentEvent(events, '2026-10-31')).toBeNull();
    expect(currentEvent([ev('viejo', '2026-11-01', '2026-11-30', true)], '2026-11-10')).toBeNull();
  });
});

describe('eventSummary', () => {
  it('suma solo los gastos del viaje y su saldo', () => {
    const s = eventSummary('roma', [exp('1', 'a', 10000, 'roma'), exp('2', 'b', 4000, 'roma'), exp('3', 'a', 999, null)], 'a');
    expect(s.totalCents).toBe(14000);
    expect(s.paidBy.get('a')).toBe(10000);
    expect(s.balanceCents).toBe(3000);
  });
});

describe('eventDates', () => {
  it('escribe las fechas', () => {
    expect(eventDates({ starts_on: '2026-11-01', ends_on: '2026-11-05' }, '2026-10-16')).toBe('1 nov – 5 nov');
    expect(eventDates({ starts_on: null, ends_on: null })).toBe('');
  });
});
