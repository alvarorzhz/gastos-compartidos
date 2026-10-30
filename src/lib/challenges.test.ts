import { describe, expect, it } from 'vitest';
import { challengeProgress, daysBetween, monthPeriod, progressText, suggestChallenges } from './challenges';
import type { Category, Challenge, Expense, SavingsContribution, SavingsGoal } from './types';

/** Los importes llevan espacio duro antes del €. */
const plain = (s: string) => s.replace(/\u00a0/g, ' ');
const cat = (id: string, name = id): Category => ({ id, household_id: 'h', name, archived: false, alert_percent: 90 });
let n = 0;
const exp = (category_id: string, spent_on: string, amount_cents: number, note: string | null = null): Expense => ({
  id: 'e' + ++n, household_id: 'h', amount_cents, spent_on, category_id, paid_by: 'a',
  owed_cents: null, note, recurring_id: null, created_by: 'a', created_at: '', updated_at: '',
});
const contribution = (goal_id: string, contributed_on: string, amount_cents: number): SavingsContribution => ({
  id: 'x' + ++n, household_id: 'h', goal_id, user_id: 'a', amount_cents, contributed_on, note: null, created_at: '',
});
const challenge = (over: Partial<Challenge>): Challenge => ({
  id: 'r', household_id: 'h', kind: 'cap', title: 'Reto', category_id: 'super', keyword: null, goal_id: null, amount_cents: 30000,
  starts_on: '2026-11-01', ends_on: '2026-11-30', proposed_by: 'a', accepted_at: '2026-10-30T10:00:00Z', created_at: '', ...over,
});

describe('daysBetween y monthPeriod', () => {
  it('cuenta días aunque cambie la hora', () => {
    expect(daysBetween('2026-10-24', '2026-10-27')).toBe(3);
    expect(daysBetween('2026-03-28', '2026-03-30')).toBe(2);
  });
  it('a final de mes el reto es para el mes que viene', () => {
    expect(monthPeriod('2026-11-05')).toEqual({ starts_on: '2026-11-01', ends_on: '2026-11-30', label: 'Este mes' });
    expect(monthPeriod('2026-10-29')).toEqual({ starts_on: '2026-11-01', ends_on: '2026-11-30', label: 'El mes que viene' });
  });
});

describe('challengeProgress: tope', () => {
  const c = challenge({});
  it('va sumando lo de la categoría en el periodo', () => {
    const p = challengeProgress(c, '2026-11-10', [exp('super', '2026-11-03', 12000), exp('super', '2026-10-30', 9000), exp('ocio', '2026-11-04', 5000)], []);
    expect(p).toMatchObject({ state: 'active', current: 12000, ratio: 0.4, daysLeft: 21, totalDays: 30 });
    expect(plain(progressText(c, p, '2026-11-10'))).toBe('Lleváis 120,00 € de 300,00 €: os quedan 180,00 € y quedan 21 días.');
  });
  it('se pierde en cuanto se pasa y se gana al acabar sin pasarse', () => {
    expect(challengeProgress(c, '2026-11-10', [exp('super', '2026-11-03', 30001)], []).state).toBe('lost');
    expect(challengeProgress(c, '2026-12-01', [exp('super', '2026-11-03', 30000)], []).state).toBe('won');
  });
  it('sin aceptar está pendiente y antes de empezar, por empezar', () => {
    expect(challengeProgress({ ...c, accepted_at: null }, '2026-11-10', [], []).state).toBe('pending');
    const p = challengeProgress(c, '2026-10-29', [], []);
    expect(p.state).toBe('upcoming');
    expect(plain(progressText(c, p, '2026-10-29'))).toBe('Empieza dentro de 3 días.');
  });
});

describe('challengeProgress: días sin', () => {
  const c = challenge({ kind: 'without', category_id: null, keyword: 'Glovo', amount_cents: null, starts_on: '2026-10-27', ends_on: '2026-11-02' });
  it('cuenta los días sin caer', () => {
    const p = challengeProgress(c, '2026-10-29', [exp('ocio', '2026-10-26', 1500, 'GLOVO')], []);
    expect(p).toMatchObject({ state: 'active', daysLeft: 5 });
    expect(plain(progressText(c, p, '2026-10-29'))).toBe('2 de 7 días sin caer; quedan 5 días.');
  });
  it('un pedido dentro del reto lo rompe', () => {
    expect(challengeProgress(c, '2026-10-29', [exp('ocio', '2026-10-28', 1500, 'Glovo pizza')], []).state).toBe('lost');
  });
  it('llegar al final sin caer es ganarlo', () => {
    expect(challengeProgress(c, '2026-11-03', [], []).state).toBe('won');
  });
});

describe('challengeProgress: ahorro', () => {
  const c = challenge({ kind: 'save', category_id: null, goal_id: 'viaje', amount_cents: 10000 });
  it('se gana en cuanto se llega, aunque no haya acabado', () => {
    const p = challengeProgress(c, '2026-11-10', [], [contribution('viaje', '2026-11-02', 6000), contribution('viaje', '2026-11-08', 4000), contribution('otra', '2026-11-08', 9000)]);
    expect(p).toMatchObject({ state: 'won', current: 10000, ratio: 1 });
  });
  it('si acaba sin llegar, se pierde', () => {
    const p = challengeProgress(c, '2026-12-01', [], [contribution('viaje', '2026-11-02', 6000)]);
    expect(p.state).toBe('lost');
    expect(plain(progressText(c, p, '2026-12-01'))).toBe('Os faltaron 40,00 €. ¡La próxima sale!');
  });
});

describe('suggestChallenges', () => {
  const goal: SavingsGoal = { id: 'viaje', household_id: 'h', name: 'Viaje', target_cents: 50000, archived: false, created_at: '' };
  it('propone tope donde os pasasteis, una semana sin pedir a domicilio y ahorrar en la hucha', () => {
    const data = {
      categories: [cat('super', 'Supermercado'), cat('ocio', 'Ocio')],
      expenses: [exp('super', '2026-10-05', 36000), exp('ocio', '2026-10-20', 2500, 'GLOVO')],
      budgets: [{ household_id: 'h', category_id: 'super', month: '2026-09-01', amount_cents: 30000 }],
      goals: [goal],
      contributions: [contribution('viaje', '2026-10-01', 45500)],
    };
    const result = suggestChallenges('2026-11-05', data);
    expect(result.map((r) => [r.kind, plain(r.title), r.amount_cents])).toEqual([
      ['cap', 'Este mes, Supermercado por debajo de 300,00 €', 30000],
      ['without', 'Una semana sin pedir comida a domicilio', null],
      ['save', 'Este mes, meter 45,00 € en «Viaje»', 4500],
    ]);
    expect(result[1]).toMatchObject({ keyword: 'glovo', starts_on: '2026-11-05', ends_on: '2026-11-11' });
  });
  it('sin presupuesto pasado, propone un 10 % menos en lo que más gastasteis', () => {
    const result = suggestChallenges('2026-11-05', { categories: [cat('super', 'Supermercado')], expenses: [exp('super', '2026-10-05', 31500)], budgets: [], goals: [], contributions: [] });
    expect(result).toEqual([expect.objectContaining({ kind: 'cap', amount_cents: 28000 })]);
  });
});
