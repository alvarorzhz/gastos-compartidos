import { effectiveBudgets } from './budget';
import { addDays, addMonths, monthOf } from './dates';
import { formatEuros } from './money';
import { normalize } from './search';
import type { Budget, Category, Challenge, Expense, SavingsContribution, SavingsGoal } from './types';

/*
 * Retos de pareja.
 *
 * Uno propone, el otro acepta, y el progreso sale solo de lo que ya apuntáis:
 * - cap: «Este mes, súper por debajo de 300 €» (lo gastado en esa categoría en el periodo).
 * - without: «Una semana sin pedir a domicilio» (ningún gasto de esa categoría, o con esa
 *   palabra en el concepto, durante esos días).
 * - save: «Meter 100 € en la hucha del viaje» (lo aportado a esa hucha en el periodo).
 */

export type ChallengeState = 'pending' | 'upcoming' | 'active' | 'won' | 'lost';

export interface ChallengeProgress {
  state: ChallengeState;
  /** Gastado (cap), aportado (save) o número de gastos que lo rompen (without). */
  current: number;
  /** De 0 a 1, para la barra: cuánto del límite se ha usado, cuánto se ha ahorrado o cuántos días han pasado. */
  ratio: number;
  totalDays: number;
  /** Días que quedan contando hoy (0 si ya ha terminado). */
  daysLeft: number;
  /** Gastos que lo rompen (without) o que cuentan (cap), del más reciente al más antiguo. */
  expenses: Expense[];
}

/** Días entre dos fechas "YYYY-MM-DD" (b − a). */
export function daysBetween(a: string, b: string): number {
  const [ya, ma, da] = a.split('-').map(Number);
  const [yb, mb, db] = b.split('-').map(Number);
  return Math.round((Date.UTC(yb, mb - 1, db) - Date.UTC(ya, ma - 1, da)) / 86_400_000);
}

const inPeriod = (date: string, c: Challenge, todayIso: string) => date >= c.starts_on && date <= c.ends_on && date <= todayIso;

/** ¿Este gasto cuenta para el reto? */
export function matches(c: Challenge, e: Expense): boolean {
  if (c.category_id && e.category_id === c.category_id) return true;
  if (c.kind === 'without' && c.keyword) return normalize(e.note ?? '').includes(normalize(c.keyword));
  return false;
}

export function challengeProgress(c: Challenge, todayIso: string, expenses: Expense[], contributions: SavingsContribution[]): ChallengeProgress {
  const totalDays = daysBetween(c.starts_on, c.ends_on) + 1;
  const started = todayIso >= c.starts_on;
  const ended = todayIso > c.ends_on;
  const daysLeft = ended ? 0 : started ? daysBetween(todayIso, c.ends_on) + 1 : totalDays;
  const elapsed = totalDays - daysLeft;
  const counted = c.kind === 'save' ? [] : expenses.filter((e) => inPeriod(e.spent_on, c, todayIso) && matches(c, e));
  const base = { totalDays, daysLeft, expenses: counted };

  if (c.kind === 'save') {
    const saved = contributions
      .filter((x) => x.goal_id === c.goal_id && inPeriod(x.contributed_on, c, todayIso))
      .reduce((t, x) => t + x.amount_cents, 0);
    const target = c.amount_cents ?? 1;
    const state: ChallengeState = !c.accepted_at ? 'pending' : !started ? 'upcoming' : saved >= target ? 'won' : ended ? 'lost' : 'active';
    return { ...base, state, current: saved, ratio: Math.max(0, Math.min(1, saved / target)) };
  }

  if (c.kind === 'cap') {
    const spent = counted.reduce((t, e) => t + e.amount_cents, 0);
    const limit = c.amount_cents ?? 0;
    const state: ChallengeState = !c.accepted_at ? 'pending' : !started ? 'upcoming' : spent > limit ? 'lost' : ended ? 'won' : 'active';
    return { ...base, state, current: spent, ratio: limit > 0 ? Math.min(1, spent / limit) : 1 };
  }

  const state: ChallengeState = !c.accepted_at ? 'pending' : !started ? 'upcoming' : counted.length > 0 ? 'lost' : ended ? 'won' : 'active';
  return { ...base, state, current: counted.length, ratio: totalDays > 0 ? elapsed / totalDays : 1 };
}

/** Cómo va, en una frase. */
export function progressText(c: Challenge, p: ChallengeProgress, todayIso: string): string {
  const days = (n: number) => (n === 1 ? 'queda 1 día' : `quedan ${n} días`);
  if (p.state === 'pending') return 'Falta que lo acepte el otro.';
  if (p.state === 'won') return '¡Reto conseguido! 🎉';
  if (p.state === 'lost') {
    if (c.kind === 'cap') return `Os habéis pasado ${formatEuros(p.current - (c.amount_cents ?? 0))}. ¡La próxima sale!`;
    if (c.kind === 'without') return 'Esta vez se ha escapado uno. ¡La próxima sale!';
    return `Os faltaron ${formatEuros((c.amount_cents ?? 0) - p.current)}. ¡La próxima sale!`;
  }
  if (p.state === 'upcoming') {
    const n = daysBetween(todayIso, c.starts_on);
    return n === 1 ? 'Empieza mañana.' : `Empieza dentro de ${n} días.`;
  }
  if (c.kind === 'cap') return `Lleváis ${formatEuros(p.current)} de ${formatEuros(c.amount_cents ?? 0)}: os quedan ${formatEuros((c.amount_cents ?? 0) - p.current)} y ${days(p.daysLeft)}.`;
  if (c.kind === 'without') {
    const done = p.totalDays - p.daysLeft;
    return done === 0 ? `Empieza hoy: ${days(p.daysLeft)}.` : `${done} de ${p.totalDays} días sin caer; ${days(p.daysLeft)}.`;
  }
  return `Lleváis ${formatEuros(p.current)} de ${formatEuros(c.amount_cents ?? 0)}; ${days(p.daysLeft)}.`;
}

/** Retos sin el id ni lo que pone el servidor: lo que se guarda al proponer. */
export type NewChallenge = Pick<Challenge, 'kind' | 'title' | 'category_id' | 'keyword' | 'goal_id' | 'amount_cents' | 'starts_on' | 'ends_on'>;

/** Periodo de un reto «del mes»: este mes, o el que viene si ya estamos a final de mes. */
export function monthPeriod(todayIso: string): { starts_on: string; ends_on: string; label: string } {
  const late = Number(todayIso.slice(8)) > 20;
  const month = late ? addMonths(monthOf(todayIso), 1) : monthOf(todayIso);
  return { starts_on: month, ends_on: addDays(addMonths(month, 1), -1), label: late ? 'El mes que viene' : 'Este mes' };
}

const DELIVERY = ['glovo', 'just eat', 'uber eats', 'deliveroo', 'telepizza'];
const EATING_OUT = /restaurant|comida|cena|bar|delivery|domicilio|ocio/;

/** Retos que tiene sentido proponer con vuestros datos (como mucho 3). */
export function suggestChallenges(
  todayIso: string,
  data: { categories: Category[]; expenses: Expense[]; budgets: Budget[]; goals: SavingsGoal[]; contributions: SavingsContribution[] },
): NewChallenge[] {
  const result: NewChallenge[] = [];
  const period = monthPeriod(todayIso);
  const lastMonth = addMonths(period.starts_on, -1);
  const active = data.categories.filter((c) => !c.archived);
  const spentIn = (month: string, categoryId: string) =>
    data.expenses.filter((e) => e.category_id === categoryId && monthOf(e.spent_on) === month).reduce((t, e) => t + e.amount_cents, 0);

  // 1. Tope: la categoría en la que más os pasasteis del presupuesto el mes pasado, o en la que más gastasteis.
  const limits = effectiveBudgets(lastMonth, data.budgets);
  const over = active
    .map((c) => ({ c, spent: spentIn(lastMonth, c.id), limit: limits.get(c.id) }))
    .filter((x) => x.limit != null && x.spent > x.limit)
    .sort((a, b) => b.spent - b.limit! - (a.spent - a.limit!))[0];
  const top = active.map((c) => ({ c, spent: spentIn(lastMonth, c.id) })).sort((a, b) => b.spent - a.spent)[0];
  if (over) {
    result.push({ kind: 'cap', title: `${period.label}, ${over.c.name} por debajo de ${formatEuros(over.limit!)}`, category_id: over.c.id, keyword: null, goal_id: null, amount_cents: over.limit!, starts_on: period.starts_on, ends_on: period.ends_on });
  } else if (top && top.spent >= 5000) {
    const step = top.spent < 10000 ? 500 : 1000;
    const target = Math.floor((top.spent * 0.9) / step) * step;
    result.push({ kind: 'cap', title: `${period.label}, ${top.c.name} por debajo de ${formatEuros(target)} (un 10 % menos)`, category_id: top.c.id, keyword: null, goal_id: null, amount_cents: target, starts_on: period.starts_on, ends_on: period.ends_on });
  }

  // 2. Días sin: pedir a domicilio, o la categoría de comer fuera.
  const since = addDays(todayIso, -60);
  const recent = data.expenses.filter((e) => e.spent_on >= since);
  const delivery = DELIVERY.map((k) => ({ k, n: recent.filter((e) => normalize(e.note ?? '').includes(k)).length })).sort((a, b) => b.n - a.n)[0];
  const eatingOut = active.find((c) => EATING_OUT.test(normalize(c.name)) && recent.some((e) => e.category_id === c.id));
  const week = { starts_on: todayIso, ends_on: addDays(todayIso, 6) };
  if (delivery.n > 0) {
    result.push({ kind: 'without', title: 'Una semana sin pedir comida a domicilio', category_id: null, keyword: delivery.k, goal_id: null, amount_cents: null, ...week });
  } else if (eatingOut) {
    result.push({ kind: 'without', title: `Una semana sin gastos de ${eatingOut.name}`, category_id: eatingOut.id, keyword: null, goal_id: null, amount_cents: null, ...week });
  }

  // 3. Ahorro: la hucha a la que más le falta.
  const goal = data.goals
    .filter((g) => !g.archived)
    .map((g) => ({ g, left: g.target_cents - data.contributions.filter((x) => x.goal_id === g.id).reduce((t, x) => t + x.amount_cents, 0) }))
    .filter((x) => x.left > 0)
    .sort((a, b) => b.left - a.left)[0];
  if (goal) {
    const amount = Math.min(10000, Math.ceil(goal.left / 500) * 500);
    result.push({ kind: 'save', title: `${period.label}, meter ${formatEuros(amount)} en «${goal.g.name}»`, category_id: null, keyword: null, goal_id: goal.g.id, amount_cents: amount, starts_on: period.starts_on, ends_on: period.ends_on });
  }
  return result;
}
