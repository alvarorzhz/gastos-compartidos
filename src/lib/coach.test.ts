import { describe, expect, it } from 'vitest';
import { compareWithNormal, emergencyCushion, formatMonths, monthScore } from './coach';
import type { PersonalBudget, PersonalEntry, PersonalRecurring } from './types';

let seq = 0;
const e = (kind: PersonalEntry['kind'], amount_cents: number, entry_on: string, category = 'Supermercado', recurring_id: string | null = null): PersonalEntry => ({
  id: String(++seq), user_id: 'a', kind, amount_cents, entry_on, category, note: null, recurring_id, created_at: '',
});
const b = (category: string, amount_cents: number): PersonalBudget => ({ user_id: 'a', category, amount_cents, updated_at: '' });
const r = (amount_cents: number, frequency: PersonalRecurring['frequency'] = 'monthly', active = true): PersonalRecurring => ({
  id: String(++seq), user_id: 'a', kind: 'expense', amount_cents, category: 'Casa', note: null, frequency, start_on: '2026-01-01', generated_count: 0, active, created_at: '',
});

/** Un mes con nómina de 2.000 € y gastos que se le pasan. */
const month = (m: string, expenses: number, category = 'Supermercado') => [e('income', 200000, `${m}-01`, 'Nómina'), e('expense', expenses, `${m}-10`, category)];

describe('emergencyCushion', () => {
  it('suma lo que sobró en los meses anteriores y lo divide por el gasto normal', () => {
    const list = [...month('2026-07', 150000), ...month('2026-08', 150000), ...month('2026-09', 150000), ...month('2026-10', 190000)];
    const c = emergencyCushion(list, '2026-10-01');
    expect(c.savedCents).toBe(150000);
    expect(c.monthlyCents).toBe(150000);
    expect(c.months).toBe(1);
    expect(c.sinceMonth).toBe('2026-07-01');
    expect(c.monthsCounted).toBe(3);
    // Faltan 3 × 1.500 − 1.500 = 3.000 € para 3 meses: 250 € al mes en un año.
    expect(c.toMinPerMonthCents).toBe(25000);
  });

  it('si gastaste más de lo que ganaste, el colchón es cero', () => {
    const c = emergencyCushion([...month('2026-09', 250000)], '2026-10-01');
    expect(c.savedCents).toBe(-50000);
    expect(c.months).toBe(0);
  });

  it('sin gastos anteriores no se puede calcular', () => {
    expect(emergencyCushion([e('income', 1000, '2026-10-01')], '2026-10-01').months).toBeNull();
  });
});

describe('compareWithNormal', () => {
  it('compara con la media de los meses anteriores y saca las categorías que más cambian', () => {
    const list = [
      ...month('2026-08', 30000), ...month('2026-09', 50000),
      e('expense', 30000, '2026-10-05'), e('expense', 12000, '2026-10-06', 'Ocio'),
    ];
    const c = compareWithNormal(list, '2026-10-01', '2026-11-03')!;
    expect(c.normalCents).toBe(40000);
    expect(c.currentCents).toBe(42000);
    expect(c.diffCents).toBe(2000);
    expect(c.upToDay).toBeNull();
    expect(c.monthsUsed).toBe(2);
    expect(c.categories.map((x) => [x.category, x.diffCents])).toEqual([['Ocio', 12000], ['Supermercado', -10000]]);
  });

  it('en el mes en curso compara solo hasta el mismo día', () => {
    const list = [
      e('expense', 10000, '2026-09-03'), e('expense', 50000, '2026-09-25'),
      e('expense', 20000, '2026-08-02'), e('expense', 40000, '2026-08-28'),
      e('expense', 18000, '2026-10-04'),
    ];
    const c = compareWithNormal(list, '2026-10-01', '2026-10-05')!;
    expect(c.upToDay).toBe(5);
    expect(c.normalCents).toBe(15000);
    expect(c.diffCents).toBe(3000);
  });

  it('con un solo mes de historial todavía no hay «normal»', () => {
    expect(compareWithNormal([...month('2026-09', 1000)], '2026-10-01', '2026-10-20')).toBeNull();
  });

  it('usa el mismo mes del año pasado si hay datos', () => {
    const list = [...month('2025-10', 70000), ...month('2026-08', 1000), ...month('2026-09', 1000)];
    expect(compareWithNormal(list, '2026-10-01', '2026-11-01')!.lastYearCents).toBe(70000);
  });
});

describe('monthScore', () => {
  const base = { recurring: [], budgets: [], todayIso: '2026-11-15' };

  it('da la nota máxima a quien ahorra, tiene límites cumplidos y buen colchón', () => {
    const history = Array.from({ length: 12 }, (_, i) => month(`2025-${String(i + 1).padStart(2, '0')}`, 100000)).flat();
    const s = monthScore({ ...base, entries: [...history, ...month('2026-10', 100000)], budgets: [b('Supermercado', 120000)], month: '2026-10-01' });
    if (typeof s === 'string') throw new Error(s);
    expect(s.score).toBe(100);
    expect(s.level).toBe('genial');
    expect(s.provisional).toBe(false);
    expect(s.savingRate).toBe(0.5);
    expect(s.tips[0]).toMatch(/Ahorras el 50 %/);
  });

  it('baja la nota y da consejos cuando gastas de más', () => {
    const s = monthScore({
      ...base,
      entries: [...month('2026-09', 190000), e('income', 200000, '2026-10-01', 'Nómina'), e('expense', 150000, '2026-10-03', 'Casa', 'fijo'), e('expense', 70000, '2026-10-08', 'Comida fuera')],
      recurring: [r(150000)],
      budgets: [b('Comida fuera', 20000)],
      month: '2026-10-01',
    });
    if (typeof s === 'string') throw new Error(s);
    expect(s.factors.map((f) => [f.key, f.points])).toEqual([['saving', 0], ['fixed', 0], ['limits', 0], ['cushion', 0]]);
    expect(s.level).toBe('flojo');
    expect(s.tips).toHaveLength(3);
    expect(s.tips[0]).toMatch(/más de lo que ingresas.*Comida fuera/);
    expect(s.tips.join(' ')).toMatch(/fijos se llevan el 75 %/);
  });

  it('sin límites, la mitad de esa parte y un consejo para ponerlos', () => {
    const s = monthScore({ ...base, entries: month('2026-10', 190000), month: '2026-10-01' });
    if (typeof s === 'string') throw new Error(s);
    expect(s.factors.find((f) => f.key === 'limits')!.points).toBe(10);
    expect(s.tips.join(' ')).toMatch(/Ponte un límite/);
  });

  it('en el mes en curso estima los gastos que no son fijos hasta fin de mes', () => {
    // Día 15 de 30: 300 € de súper pasan a 600 €; el fijo de 500 € no se duplica.
    const s = monthScore({
      ...base,
      entries: [e('income', 200000, '2026-11-01'), e('expense', 50000, '2026-11-02', 'Casa', 'fijo'), e('expense', 30000, '2026-11-10')],
      month: '2026-11-01',
    });
    if (typeof s === 'string') throw new Error(s);
    expect(s.provisional).toBe(true);
    expect(s.savingRate).toBeCloseTo((200000 - 110000) / 200000);
  });

  it('no da nota sin ingresos ni los primeros días del mes', () => {
    expect(monthScore({ ...base, entries: [e('expense', 100, '2026-10-02')], month: '2026-10-01' })).toBe('no-income');
    expect(monthScore({ ...base, entries: month('2026-11', 100), month: '2026-11-01', todayIso: '2026-11-03' })).toBe('too-early');
  });
});

describe('formatMonths', () => {
  it('escribe los meses en español', () => {
    expect(formatMonths(1)).toBe('1 mes');
    expect(formatMonths(2.54)).toBe('2,5 meses');
    expect(formatMonths(0.4)).toBe('menos de 1 mes');
    expect(formatMonths(0)).toBe('0 meses');
  });
});
