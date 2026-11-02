import { describe, expect, it } from 'vitest';
import { calendarStats, dayTotals, heatLevel, monthGrid, shortEuros, upcomingFixed } from './calendar';
import type { Expense, RecurringExpense } from './types';

let n = 0;
function exp(spent_on: string, amount_cents: number): Expense {
  n++;
  return {
    id: 'e' + n, household_id: 'h', amount_cents, spent_on, category_id: 'c', paid_by: 'a', owed_cents: null, note: null,
    recurring_id: null, event_id: null, created_by: 'a', created_at: '2026-11-01T10:00:00Z', updated_at: '2026-11-01T10:00:00Z',
  };
}

function fixed(over: Partial<RecurringExpense>): RecurringExpense {
  return {
    id: 'r1', household_id: 'h', amount_cents: 1299, category_id: 'c', paid_by: 'a', owed_cents: null, note: 'Netflix',
    frequency: 'monthly', start_on: '2026-01-15', generated_count: 10, active: true, created_by: 'a', created_at: '2026-01-01T00:00:00Z',
    ...over,
  };
}

describe('monthGrid', () => {
  it('empieza en lunes y completa las semanas', () => {
    // Noviembre de 2026 empieza en domingo y acaba en lunes.
    const weeks = monthGrid('2026-11-01');
    expect(weeks[0][0]).toBe('2026-10-26');
    expect(weeks[0][6]).toBe('2026-11-01');
    expect(weeks.at(-1)![0]).toBe('2026-11-30');
    expect(weeks).toHaveLength(6);
    expect(weeks.every((w) => w.length === 7)).toBe(true);
  });

  it('un mes que empieza en lunes no lleva días del anterior', () => {
    expect(monthGrid('2027-02-01')[0][0]).toBe('2027-02-01');
    expect(monthGrid('2027-02-01')).toHaveLength(4);
  });
});

describe('dayTotals', () => {
  it('suma cada día del mes y deja fuera los demás meses', () => {
    const t = dayTotals([exp('2026-11-02', 1000), exp('2026-11-02', 550), exp('2026-11-05', 300), exp('2026-10-31', 999)], '2026-11-01');
    expect(t.get('2026-11-02')).toEqual({ cents: 1550, count: 2 });
    expect(t.get('2026-11-05')).toEqual({ cents: 300, count: 1 });
    expect(t.has('2026-10-31')).toBe(false);
  });
});

describe('heatLevel', () => {
  it('va de 0 a 4 y suaviza los días enormes', () => {
    expect(heatLevel(0, 10000)).toBe(0);
    expect(heatLevel(10000, 10000)).toBe(4);
    expect(heatLevel(100, 100000)).toBe(1);
    expect(heatLevel(25000, 100000)).toBe(2);
  });
});

describe('upcomingFixed', () => {
  it('pone los fijos que faltan desde hoy hasta fin de mes', () => {
    const map = upcomingFixed([fixed({})], '2026-11-01', '2026-11-02');
    expect([...map.keys()]).toEqual(['2026-11-15']);
    expect(map.get('2026-11-15')![0]).toMatchObject({ note: 'Netflix', cents: 1299 });
  });

  it('no pone los ya pasados, los parados ni los de meses pasados', () => {
    expect(upcomingFixed([fixed({})], '2026-11-01', '2026-11-20').size).toBe(0);
    expect(upcomingFixed([fixed({ active: false })], '2026-11-01', '2026-11-02').size).toBe(0);
    expect(upcomingFixed([fixed({})], '2026-10-01', '2026-11-02').size).toBe(0);
  });

  it('un fijo semanal sale cada semana', () => {
    const map = upcomingFixed([fixed({ frequency: 'weekly', start_on: '2026-11-02', generated_count: 1 })], '2026-11-01', '2026-11-02');
    expect([...map.keys()]).toEqual(['2026-11-09', '2026-11-16', '2026-11-23', '2026-11-30']);
  });
});

describe('calendarStats', () => {
  it('cuenta los días sin gastar hasta hoy y el día que más', () => {
    const t = dayTotals([exp('2026-11-01', 1000), exp('2026-11-03', 5000)], '2026-11-01');
    const s = calendarStats(t, '2026-11-01', '2026-11-04');
    expect(s).toEqual({ quietDays: 2, daysCounted: 4, busiest: { date: '2026-11-03', cents: 5000 }, perDayCents: 1500 });
  });

  it('en un mes pasado cuenta el mes entero', () => {
    expect(calendarStats(new Map(), '2026-10-01', '2026-11-04')).toMatchObject({ quietDays: 31, daysCounted: 31, busiest: null });
  });
});

describe('shortEuros', () => {
  it('abrevia para que quepa en la casilla', () => {
    expect(shortEuros(5420)).toBe('54');
    expect(shortEuros(450)).toBe('4,5');
    expect(shortEuros(125000)).toBe('1,3 mil');
  });
});
