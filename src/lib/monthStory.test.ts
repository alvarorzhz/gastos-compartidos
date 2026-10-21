import { describe, expect, it } from 'vitest';
import { monthStory, weekdayOf, type StorySlide } from './monthStory';
import type { ShoppingItem } from './shopping';
import type { Category, Expense } from './types';
import type { HouseholdData } from './useHousehold';

const cat = (id: string): Category => ({ id, household_id: 'h', name: id, archived: false, alert_percent: 90 });
let seq = 0;
const exp = (category_id: string, spent_on: string, amount_cents: number, note: string | null = null, extra: Partial<Expense> = {}): Expense => ({
  id: String(++seq), household_id: 'h', amount_cents, spent_on, category_id, paid_by: 'a',
  owed_cents: null, note, recurring_id: null, created_by: 'a', created_at: '', updated_at: '', ...extra,
});

function household(expenses: Expense[], extra: Partial<HouseholdData> = {}): HouseholdData {
  return {
    household: { id: 'h', name: 'Casa', currency: 'EUR', default_split_user: null, default_split_percent: null },
    members: [{ household_id: 'h', user_id: 'a', display_name: 'Ana' }, { household_id: 'h', user_id: 'b', display_name: 'Bea' }],
    invitation: null,
    categories: [cat('Súper'), cat('Ocio')],
    expenses,
    settlements: [],
    budgets: [],
    recurring: [],
    personal: [],
    personalRecurring: [],
    personalBudgets: [],
    goals: [],
    contributions: [],
    events: [],
    ...extra,
  };
}

const find = <K extends StorySlide['kind']>(slides: StorySlide[], kind: K) =>
  slides.find((s) => s.kind === kind) as Extract<StorySlide, { kind: K }> | undefined;

describe('monthStory', () => {
  it('no cuenta nada de un mes sin gastos', () => {
    expect(monthStory(household([exp('Súper', '2026-08-03', 1000)]), 'a', '2026-09-01', [], '2026-10-21').slides).toEqual([]);
  });

  it('cuenta el mes: total con el anterior, categoría estrella, sitio favorito y día de la semana', () => {
    const data = household([
      exp('Súper', '2026-09-05', 5000, 'MERCADONA S.A.'), // sábado
      exp('Súper', '2026-09-12', 3000, 'Mercadona'), // sábado
      exp('Súper', '2026-09-19', 2000, 'mercadona'),
      exp('Ocio', '2026-09-10', 9000, 'Cine'),
      exp('Ocio', '2026-09-11', 500, 'Netflix', { recurring_id: 'r' }),
      exp('Súper', '2026-09-08', 500, 'Frutería'),
      exp('Súper', '2026-08-03', 10000),
    ]);
    const story = monthStory(data, 'a', '2026-09-01', [], '2026-10-21');
    expect(story.partial).toBe(false);
    expect(story.slides[0]).toEqual({ kind: 'intro', spentCents: 20000, count: 6, activeDays: 6 });
    const total = find(story.slides, 'total')!;
    expect(total.previousCents).toBe(10000);
    // Sin los meses vacíos de antes de empezar.
    expect(total.history.map((h) => h.month)).toEqual(['2026-08-01', '2026-09-01']);
    const category = find(story.slides, 'category')!;
    // Los fijos (Netflix) no cuentan para los datos curiosos.
    expect(category).toMatchObject({ name: 'Súper', cents: 10500, previousCents: 10000, withoutFixed: true });
    expect(category.top.map((c) => c.name)).toEqual(['Súper', 'Ocio']);
    expect(find(story.slides, 'place')).toMatchObject({ name: 'Mercadona', visits: 3, cents: 10000 });
    expect(find(story.slides, 'weekday')).toMatchObject({ weekday: 5, cents: 10000 });
    expect(find(story.slides, 'biggest')).toMatchObject({ cents: 9000, note: 'Cine', categoryName: 'Ocio' });
    expect(story.slides[story.slides.length - 1].kind).toBe('outro');
  });

  it('cuenta los días sin gastar y la racha más larga', () => {
    const data = household([exp('Súper', '2026-10-01', 1000), exp('Súper', '2026-10-05', 1000)]);
    const calm = find(monthStory(data, 'a', '2026-10-01', [], '2026-10-06').slides, 'calm')!;
    expect(calm.days).toHaveLength(6);
    expect(calm.quietDays).toBe(4);
    expect(calm.longestQuiet).toBe(3);
  });

  it('marca el mes en curso como parcial y compara el presupuesto', () => {
    const data = household([exp('Súper', '2026-10-02', 12000), exp('Ocio', '2026-10-03', 3000)], {
      budgets: [{ household_id: 'h', category_id: 'Súper', month: '2026-09-01', amount_cents: 10000 }],
    });
    const story = monthStory(data, 'a', '2026-10-01', [], '2026-10-21');
    expect(story.partial).toBe(true);
    expect(find(story.slides, 'budget')).toEqual({ kind: 'budget', budgetCents: 10000, spentCents: 12000, overBudget: [{ name: 'Súper', overCents: 2000 }] });
  });

  it('incluye huchas, compra y viajes solo si hubo algo', () => {
    const base = [exp('Súper', '2026-09-02', 1000), exp('Ocio', '2026-09-03', 5000, 'Cena', { event_id: 'e' })];
    expect(find(monthStory(household(base), 'a', '2026-09-01', [], '2026-10-21').slides, 'savings')).toBeUndefined();

    const item = (name: string, bought_at: string, expense_id: string | null = null) =>
      ({ id: name + bought_at, name, status: 'bought', bought_at, expense_id }) as ShoppingItem;
    const data = household(base, {
      goals: [{ id: 'g', household_id: 'h', name: 'Japón', target_cents: 100000, archived: false, created_at: '' }],
      contributions: [
        { id: '1', household_id: 'h', goal_id: 'g', user_id: 'a', amount_cents: 20000, contributed_on: '2026-09-10', note: null, created_at: '' },
        { id: '2', household_id: 'h', goal_id: 'g', user_id: 'b', amount_cents: 30000, contributed_on: '2026-08-10', note: null, created_at: '' },
      ],
      events: [{ id: 'e', household_id: 'h', name: 'Roma', starts_on: null, ends_on: null, archived: false, created_by: null, created_at: '' }],
    });
    const items = [item('Leche', '2026-09-03T10:00:00', 'x'), item('leche', '2026-09-10T10:00:00', 'y'), item('Pan', '2026-09-10T10:00:00', 'y'), item('Pan', '2026-08-10T10:00:00')];
    const slides = monthStory(data, 'a', '2026-09-01', items, '2026-10-21').slides;
    expect(find(slides, 'savings')).toEqual({ kind: 'savings', contributedCents: 20000, goals: [{ name: 'Japón', savedCents: 50000, targetCents: 100000, ratio: 0.5 }] });
    expect(find(slides, 'shopping')).toEqual({ kind: 'shopping', itemsBought: 3, topProduct: { name: 'Leche', times: 2 }, tickets: 2 });
    expect(find(slides, 'trips')).toEqual({ kind: 'trips', events: [{ name: 'Roma', cents: 5000 }] });
    expect(find(slides, 'payers')!.paidBy).toEqual([{ userId: 'a', cents: 6000, share: 1 }]);
  });
});

describe('weekdayOf', () => {
  it('empieza la semana en lunes', () => {
    expect(weekdayOf('2026-10-19')).toBe(0);
    expect(weekdayOf('2026-10-25')).toBe(6);
  });
});
