import { describe, expect, it } from 'vitest';
import { budgetStreak, greeting, partnerActivity, personColor, reactionsOf, timeAgo } from './couple';
import type { Budget, Category, Expense, ExpenseReaction, Member } from './types';

/** Intl separa el importe del € con un espacio duro. */
const plain = (s: string | undefined) => s?.replace(/\u00a0/g, ' ');

const cat: Category = { id: 'casa', household_id: 'h', name: 'Casa', archived: false, alert_percent: 90 };
const exp = (id: string, spent_on: string, amount_cents: number, extra: Partial<Expense> = {}): Expense => ({
  id, household_id: 'h', amount_cents, spent_on, category_id: 'casa', paid_by: 'a',
  owed_cents: null, note: null, recurring_id: null, created_by: 'a', created_at: spent_on + 'T10:00:00Z', updated_at: '', ...extra,
});
const member = (user_id: string, extra: Partial<Member> = {}): Member => ({ household_id: 'h', user_id, display_name: user_id, ...extra });
const reaction = (expense_id: string, user_id: string, extra: Partial<ExpenseReaction> = {}): ExpenseReaction => ({
  expense_id, user_id, household_id: 'h', emoji: '❤️', comment: null, created_at: '', updated_at: '2026-10-24T09:00:00Z', ...extra,
});

describe('personColor', () => {
  it('usa el color elegido o, si no, el de siempre según el orden', () => {
    const members = [member('a'), member('b', { color: 'blue' })];
    expect(personColor(members, 'a')).toBe('teal');
    expect(personColor(members, 'b')).toBe('blue');
    expect(personColor([member('a'), member('b')], 'b')).toBe('coral');
    expect(personColor(members, 'x')).toBe('none');
  });
});

describe('greeting y timeAgo', () => {
  it('saluda según la hora', () => {
    expect(greeting(new Date(2026, 9, 24, 9))).toBe('Buenos días');
    expect(greeting(new Date(2026, 9, 24, 16))).toBe('Buenas tardes');
    expect(greeting(new Date(2026, 9, 24, 23))).toBe('Buenas noches');
    expect(greeting(new Date(2026, 9, 24, 3))).toBe('Buenas noches');
  });
  it('dice hace cuánto', () => {
    const now = new Date('2026-10-24T12:00:00Z');
    expect(timeAgo('2026-10-24T11:59:40Z', now)).toBe('hace un momento');
    expect(timeAgo('2026-10-24T11:55:00Z', now)).toBe('hace 5 min');
    expect(timeAgo('2026-10-24T11:00:00Z', now)).toBe('hace 1 hora');
    expect(timeAgo('2026-10-24T09:00:00Z', now)).toBe('hace 3 horas');
    expect(timeAgo('2026-10-23T09:00:00Z', now)).toBe('ayer');
    expect(timeAgo('2026-10-20T09:00:00Z', now)).toBe('hace 4 días');
  });
});

describe('partnerActivity', () => {
  const base = { reactions: [], settlements: [], contributions: [], goals: [], categories: [cat] };
  const now = new Date('2026-10-24T12:00:00Z');

  it('enseña lo más reciente que hizo la pareja', () => {
    const expenses = [exp('1', '2026-10-22', 6420, { note: 'Mercadona', created_by: 'b' }), exp('2', '2026-10-23', 1000)];
    const latest = partnerActivity({ ...base, expenses }, 'b', now);
    expect({ ...latest, text: plain(latest?.text) }).toEqual({ at: '2026-10-22T10:00:00Z', text: 'apuntó Mercadona · 64,20 €', expenseId: '1' });
    const reactions = [reaction('2', 'b', { comment: '¡Repetimos!' })];
    expect(partnerActivity({ ...base, expenses, reactions }, 'b', now)?.text).toBe('comentó en Casa: «¡Repetimos!»');
  });

  it('no enseña nada de hace más de una semana', () => {
    expect(partnerActivity({ ...base, expenses: [exp('1', '2026-10-01', 500, { created_by: 'b' })] }, 'b', now)).toBeNull();
  });

  it('cuenta las aportaciones a huchas', () => {
    const contributions = [{ id: 'c', household_id: 'h', goal_id: 'g', user_id: 'b', amount_cents: 5000, contributed_on: '2026-10-24', note: null, created_at: '2026-10-24T08:00:00Z' }];
    const goals = [{ id: 'g', household_id: 'h', name: 'Japón', target_cents: 100000, archived: false, created_at: '' }];
    expect(plain(partnerActivity({ ...base, expenses: [], contributions, goals }, 'b', now)?.text)).toBe('puso 50,00 € en la hucha «Japón»');
  });
});

describe('budgetStreak', () => {
  const budgets: Budget[] = [{ household_id: 'h', category_id: 'casa', month: '2026-06-01', amount_cents: 10000 }];

  it('cuenta los meses seguidos dentro del presupuesto hasta el mes pasado', () => {
    const expenses = [exp('1', '2026-06-10', 20000), exp('2', '2026-07-10', 9000), exp('3', '2026-08-10', 5000), exp('4', '2026-09-10', 10000), exp('5', '2026-10-10', 50000)];
    expect(budgetStreak('2026-10-24', [cat], expenses, budgets)).toBe(3);
  });

  it('sin presupuesto no hay racha', () => {
    expect(budgetStreak('2026-10-24', [cat], [exp('1', '2026-09-10', 100)], [])).toBe(0);
  });
});

describe('reactionsOf', () => {
  it('pone primero la de la pareja', () => {
    const list = reactionsOf([reaction('1', 'a'), reaction('1', 'b'), reaction('2', 'b')], '1', 'a');
    expect(list.map((r) => r.user_id)).toEqual(['b', 'a']);
  });
});
