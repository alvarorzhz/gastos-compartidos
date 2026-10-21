import { balanceFor, roundBalance } from './balance';
import { monthlySummary, totals } from './budget';
import { addDays, addMonths, monthOf, toIsoDate } from './dates';
import { formatEuros } from './money';
import { goalProgress } from './savings';
import { normalize } from './search';
import type { ShoppingItem } from './shopping';
import { breakdown, monthlyTotals } from './stats';
import { storeName } from './storePrices';
import type { HouseholdData } from './useHousehold';

/*
 * Historia del mes (al estilo de los resúmenes anuales de música): el mes común de la pareja
 * contado en pantallas con un dato curioso cada una. Aquí solo se calculan los datos; cada
 * pantalla sale solo si hay algo que contar. Lo de Personal no entra: es privado de cada uno.
 */

export interface StoryPart { name: string; cents: number; share: number }

export type StorySlide =
  | { kind: 'intro'; spentCents: number; count: number; activeDays: number }
  | { kind: 'total'; spentCents: number; previousCents: number; history: { month: string; cents: number }[] }
  | { kind: 'category'; name: string; cents: number; share: number; previousCents: number; top: StoryPart[]; withoutFixed: boolean }
  | { kind: 'place'; name: string; visits: number; cents: number; others: { name: string; visits: number }[] }
  | { kind: 'weekday'; weekday: number; cents: number; byWeekday: number[] }
  | { kind: 'biggest'; cents: number; note: string | null; categoryName: string; date: string }
  | { kind: 'budget'; budgetCents: number; spentCents: number; overBudget: { name: string; overCents: number }[] }
  | { kind: 'payers'; paidBy: { userId: string; cents: number; share: number }[]; balanceCents: number }
  | { kind: 'savings'; contributedCents: number; goals: { name: string; savedCents: number; targetCents: number; ratio: number }[] }
  | { kind: 'shopping'; itemsBought: number; topProduct: { name: string; times: number } | null; tickets: number }
  | { kind: 'trips'; events: { name: string; cents: number }[] }
  | { kind: 'calm'; quietDays: number; longestQuiet: number; days: { date: string; spent: boolean }[] }
  | { kind: 'outro'; spentCents: number; highlights: string[] };

export interface MonthStory {
  month: string;
  /** El mes aún no ha terminado: los datos son hasta hoy. */
  partial: boolean;
  slides: StorySlide[];
}

/** Días de la semana con el lunes primero (0 = lunes … 6 = domingo). */
export function weekdayOf(isoDate: string): number {
  const [y, m, d] = isoDate.split('-').map(Number);
  return (new Date(y, m - 1, d).getDay() + 6) % 7;
}

export const WEEKDAYS = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo'];

/** Fecha local (YYYY-MM-DD) de una marca de tiempo. */
const localDay = (iso: string) => toIsoDate(new Date(iso));

export function monthStory(data: HouseholdData, me: string, month: string, items: ShoppingItem[] = [], todayIso = toIsoDate(new Date())): MonthStory {
  const currentMonth = monthOf(todayIso);
  const partial = month === currentMonth;
  const expenses = data.expenses.filter((e) => monthOf(e.spent_on) === month);
  const slides: StorySlide[] = [];
  if (expenses.length === 0) return { month, partial, slides };

  const rows = monthlySummary(month, data.categories, data.expenses, data.budgets);
  const sum = totals(rows);
  const spentCents = sum.spentCents;
  const lastDay = partial ? todayIso : addDays(addMonths(month, 1), -1);
  const days: { date: string; spent: boolean }[] = [];
  const spentDays = new Set(expenses.map((e) => e.spent_on));
  for (let d = month; d <= lastDay; d = addDays(d, 1)) days.push({ date: d, spent: spentDays.has(d) });

  slides.push({ kind: 'intro', spentCents, count: expenses.length, activeDays: spentDays.size });

  // Gasto frente a los meses anteriores.
  const history = monthlyTotals(data.expenses, data.budgets, month, 6).map((t) => ({ month: t.month, cents: t.spentCents }));
  const previousCents = history[history.length - 2]?.cents ?? 0;
  // Sin los meses vacíos de antes de empezar a usar la app.
  slides.push({ kind: 'total', spentCents, previousCents, history: history.slice(history.findIndex((h) => h.cents > 0)) });

  // Lo fijo (alquiler, facturas) sería siempre lo mismo: los datos curiosos salen de lo demás.
  const variable = expenses.filter((e) => !e.recurring_id);
  const hasFixed = variable.length < expenses.length;

  // Categoría estrella.
  const byCategory = breakdown(variable, month, (e) => e.category_id);
  if (byCategory.length > 0) {
    const nameOf = (id: string) => data.categories.find((c) => c.id === id)?.name ?? 'Otros';
    const previousMonth = addMonths(month, -1);
    const first = byCategory[0];
    slides.push({
      kind: 'category',
      name: nameOf(first.id),
      cents: first.cents,
      share: first.share,
      previousCents: data.expenses
        .filter((e) => !e.recurring_id && e.category_id === first.id && monthOf(e.spent_on) === previousMonth)
        .reduce((s, e) => s + e.amount_cents, 0),
      top: byCategory.slice(0, 4).map((c) => ({ name: nameOf(c.id), cents: c.cents, share: c.share })),
      withoutFixed: hasFixed,
    });
  }

  // Sitio al que más habéis ido (por el concepto: «Mercadona», «Bar Manolo»…). Los fijos no cuentan.
  const places = new Map<string, { name: string; visits: number; cents: number }>();
  for (const e of expenses) {
    if (e.recurring_id) continue;
    const name = storeName(e.note);
    if (!name) continue;
    const key = normalize(name);
    const p = places.get(key) ?? { name, visits: 0, cents: 0 };
    p.visits += 1;
    p.cents += e.amount_cents;
    places.set(key, p);
  }
  const ranking = [...places.values()].sort((a, b) => b.visits - a.visits || b.cents - a.cents);
  if (ranking[0]?.visits >= 2) {
    slides.push({ kind: 'place', ...ranking[0], others: ranking.slice(1, 4).filter((p) => p.visits >= 2).map(({ name, visits }) => ({ name, visits })) });
  }

  // Día de la semana que más se gasta.
  if (variable.length >= 5) {
    const byWeekday = [0, 0, 0, 0, 0, 0, 0];
    for (const e of variable) byWeekday[weekdayOf(e.spent_on)] += e.amount_cents;
    const weekday = byWeekday.indexOf(Math.max(...byWeekday));
    slides.push({ kind: 'weekday', weekday, cents: byWeekday[weekday], byWeekday });
  }

  // El gasto más grande.
  if (variable.length >= 2) {
    const biggest = variable.reduce((a, b) => (b.amount_cents > a.amount_cents ? b : a));
    slides.push({
      kind: 'biggest',
      cents: biggest.amount_cents,
      note: biggest.note?.trim() || null,
      categoryName: data.categories.find((c) => c.id === biggest.category_id)?.name ?? 'Otros',
      date: biggest.spent_on,
    });
  }

  // Presupuesto.
  if (sum.budgetCents > 0) {
    slides.push({
      kind: 'budget',
      budgetCents: sum.budgetCents,
      spentCents: sum.budgetedSpentCents,
      overBudget: rows
        .filter((r) => r.budgetCents != null && r.spentCents > r.budgetCents)
        .map((r) => ({ name: r.category.name, overCents: r.spentCents - (r.budgetCents ?? 0) }))
        .sort((a, b) => b.overCents - a.overCents),
    });
  }

  // Quién pagó.
  if (data.members.length > 1) {
    slides.push({
      kind: 'payers',
      paidBy: breakdown(data.expenses, month, (e) => e.paid_by).map((s) => ({ userId: s.id, cents: s.cents, share: s.share })),
      balanceCents: roundBalance(balanceFor(me, data.expenses, data.settlements)),
    });
  }

  // Huchas.
  const contributed = data.contributions.filter((c) => monthOf(c.contributed_on) === month).reduce((s, c) => s + c.amount_cents, 0);
  if (contributed > 0) {
    const goals = data.goals
      .filter((g) => !g.archived)
      .map((g) => {
        const p = goalProgress(g, data.contributions);
        return { name: g.name, savedCents: p.savedCents, targetCents: g.target_cents, ratio: p.ratio };
      })
      .sort((a, b) => b.ratio - a.ratio)
      .slice(0, 3);
    slides.push({ kind: 'savings', contributedCents: contributed, goals });
  }

  // Lista de la compra.
  const bought = items.filter((i) => i.status === 'bought' && i.bought_at && monthOf(localDay(i.bought_at)) === month);
  if (bought.length >= 3) {
    const counts = new Map<string, { name: string; times: number }>();
    for (const i of bought) {
      const key = normalize(i.name);
      const c = counts.get(key) ?? { name: i.name, times: 0 };
      c.times += 1;
      counts.set(key, c);
    }
    const top = [...counts.values()].sort((a, b) => b.times - a.times)[0];
    slides.push({
      kind: 'shopping',
      itemsBought: bought.length,
      topProduct: top.times >= 2 ? top : null,
      tickets: new Set(bought.map((i) => i.expense_id).filter(Boolean)).size,
    });
  }

  // Viajes y planes.
  const trips = data.events
    .map((ev) => ({ name: ev.name, cents: expenses.filter((e) => e.event_id === ev.id).reduce((s, e) => s + e.amount_cents, 0) }))
    .filter((t) => t.cents > 0)
    .sort((a, b) => b.cents - a.cents);
  if (trips.length > 0) slides.push({ kind: 'trips', events: trips });

  // Días sin gastar.
  let longestQuiet = 0;
  let run = 0;
  for (const d of days) {
    run = d.spent ? 0 : run + 1;
    longestQuiet = Math.max(longestQuiet, run);
  }
  const quietDays = days.filter((d) => !d.spent).length;
  if (quietDays > 0) slides.push({ kind: 'calm', quietDays, longestQuiet, days });

  slides.push({ kind: 'outro', spentCents, highlights: highlights(slides) });
  return { month, partial, slides };
}

/** Las tres o cuatro cosas que mejor resumen el mes, para la última pantalla. */
function highlights(slides: StorySlide[]): string[] {
  const out: string[] = [];
  for (const s of slides) {
    if (s.kind === 'category') out.push(`Lo que más: ${s.name}`);
    if (s.kind === 'place') out.push(`${s.visits} veces en ${s.name}`);
    if (s.kind === 'weekday') out.push(`Vuestro día: el ${WEEKDAYS[s.weekday]}`);
    if (s.kind === 'budget') out.push(s.spentCents <= s.budgetCents ? 'Presupuesto cumplido' : 'Presupuesto superado');
    if (s.kind === 'savings') out.push(`${formatEuros(s.contributedCents)} a las huchas`);
  }
  return out.slice(0, 4);
}
