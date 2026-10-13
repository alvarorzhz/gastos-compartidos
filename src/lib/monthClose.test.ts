import { describe, expect, it } from 'vitest';
import { monthClose } from './monthClose';
import { goalProgress } from './savings';
import type { Category, Expense } from './types';
import type { HouseholdData } from './useHousehold';

const cat = (id: string): Category => ({ id, household_id: 'h', name: id, archived: false, alert_percent: 90 });
const exp = (category_id: string, spent_on: string, amount_cents: number, paid_by = 'a'): Expense => ({
  id: Math.random().toString(), household_id: 'h', amount_cents, spent_on, category_id, paid_by,
  owed_cents: null, note: null, recurring_id: null, created_by: paid_by, created_at: '', updated_at: '',
});

describe('monthClose', () => {
  it('resume el mes con comparación, presupuestos superados, pagos y saldo', () => {
    const data = {
      categories: [cat('super'), cat('ocio')],
      expenses: [exp('super', '2026-09-03', 30000), exp('ocio', '2026-09-10', 8000, 'b'), exp('super', '2026-08-03', 25000)],
      budgets: [{ household_id: 'h', category_id: 'ocio', month: '2026-09-01', amount_cents: 5000 }],
      settlements: [],
    } as unknown as HouseholdData;
    const c = monthClose(data, 'a', '2026-09-01');
    expect(c.spentCents).toBe(38000);
    expect(c.previousSpentCents).toBe(25000);
    expect(c.categories[0]).toEqual({ categoryId: 'super', name: 'super', cents: 30000, previousCents: 25000 });
    expect(c.overBudget).toEqual([{ name: 'ocio', overCents: 3000 }]);
    expect(c.paidBy).toEqual([{ userId: 'a', cents: 30000 }, { userId: 'b', cents: 8000 }]);
    // a pagó 300 + 250 (la mitad es de b) y b pagó 80 (la mitad es de a): b debe 275 − 40 = 235 €
    expect(c.balanceCents).toBe(23500);
  });
});

describe('goalProgress', () => {
  it('suma aportaciones y retiradas por persona', () => {
    const goal = { id: 'g', household_id: 'h', name: 'Viaje', target_cents: 100000, archived: false, created_at: '' };
    const c = (user_id: string, amount_cents: number, goal_id = 'g') => ({ id: '', household_id: 'h', goal_id, user_id, amount_cents, contributed_on: '', note: null, created_at: '' });
    const p = goalProgress(goal, [c('a', 30000), c('b', 20000), c('a', -5000), c('a', 99999, 'otra')]);
    expect(p.savedCents).toBe(45000);
    expect(p.ratio).toBe(0.45);
    expect(p.byUser.get('a')).toBe(25000);
  });
});
