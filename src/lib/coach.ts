import { addMonths, monthOf } from './dates';
import { formatEuros } from './money';
import { monthlyEquivalent } from './recurring';
import type { PersonalBudget, PersonalEntry, PersonalRecurring } from './types';

/*
 * Coach de Personal: la nota del mes con consejos, el colchón de emergencia (con lo que te ha
 * sobrado en los meses anteriores) y la comparación con tu mes normal. Todo sale de lo que
 * tienes apuntado en Personal; nada sale del móvil.
 */

/** Meses que se miran hacia atrás para saber cuál es «tu mes normal». */
export const NORMAL_MONTHS = 6;
/** Meses de gastos que conviene tener guardados: lo mínimo y lo ideal. */
export const CUSHION_MIN = 3;
export const CUSHION_GOAL = 6;
/** Día a partir del cual sale la nota del mes en curso (antes sería adivinar). */
export const SCORE_FROM_DAY = 5;

const day = (iso: string) => Number(iso.slice(8, 10));
const daysIn = (month: string) => {
  const [y, m] = month.split('-').map(Number);
  return new Date(y, m, 0).getDate();
};
const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
const percent = (x: number) => `${Math.round(x * 100)} %`;

interface MonthTotals {
  incomeCents: number;
  expenseCents: number;
  /** Gastos que no vienen de un fijo (los que se pueden recortar). */
  variableCents: number;
  byCategory: Map<string, number>;
  variableByCategory: Map<string, number>;
  any: boolean;
}

/** Totales de un mes; con `upToDay`, solo hasta ese día del mes. */
function totals(entries: PersonalEntry[], month: string, upToDay = 31): MonthTotals {
  const t: MonthTotals = { incomeCents: 0, expenseCents: 0, variableCents: 0, byCategory: new Map(), variableByCategory: new Map(), any: false };
  for (const e of entries) {
    if (monthOf(e.entry_on) !== month) continue;
    t.any = true;
    if (day(e.entry_on) > upToDay) continue;
    if (e.kind === 'income') {
      t.incomeCents += e.amount_cents;
      continue;
    }
    t.expenseCents += e.amount_cents;
    t.byCategory.set(e.category, (t.byCategory.get(e.category) ?? 0) + e.amount_cents);
    if (!e.recurring_id) {
      t.variableCents += e.amount_cents;
      t.variableByCategory.set(e.category, (t.variableByCategory.get(e.category) ?? 0) + e.amount_cents);
    }
  }
  return t;
}

/* ───────────── Colchón de emergencia ───────────── */

export interface Cushion {
  /** Lo que te ha sobrado (ingresos menos gastos) sumando los meses anteriores. Puede ser negativo. */
  savedCents: number;
  /** Lo que gastas en un mes normal (media de los últimos 3 meses con gastos). */
  monthlyCents: number;
  /** Meses que aguantarías sin ingresos; null si aún no hay gastos con los que calcularlo. */
  months: number | null;
  /** Primer mes que se ha sumado. */
  sinceMonth: string | null;
  /** Meses con movimientos que se han sumado. */
  monthsCounted: number;
  /** Lo que habría que apartar al mes para llegar a 3 meses de colchón en un año (0 si ya llegas). */
  toMinPerMonthCents: number;
}

/**
 * El colchón se calcula con el remanente: lo que sobró cada mes antes de `month`. No hace
 * falta decir cuánto tienes en el banco; cuanto más historial haya apuntado, más fiable.
 */
export function emergencyCushion(entries: PersonalEntry[], month: string): Cushion {
  const months = [...new Set(entries.map((e) => monthOf(e.entry_on)))].filter((m) => m < month).sort();
  let savedCents = 0;
  for (const e of entries) {
    if (monthOf(e.entry_on) >= month) continue;
    savedCents += e.kind === 'income' ? e.amount_cents : -e.amount_cents;
  }
  const recent = months
    .map((m) => totals(entries, m).expenseCents)
    .filter((c) => c > 0)
    .slice(-3);
  const monthlyCents = recent.length ? Math.round(recent.reduce((s, c) => s + c, 0) / recent.length) : 0;
  const result = monthlyCents > 0 ? Math.max(0, savedCents) / monthlyCents : null;
  const missing = CUSHION_MIN * monthlyCents - Math.max(0, savedCents);
  return {
    savedCents,
    monthlyCents,
    months: result,
    sinceMonth: months[0] ?? null,
    monthsCounted: months.length,
    toMinPerMonthCents: monthlyCents > 0 && missing > 0 ? Math.ceil(missing / 12 / 100) * 100 : 0,
  };
}

/* ───────────── Comparar con tu mes normal ───────────── */

export interface CategoryDiff {
  category: string;
  currentCents: number;
  normalCents: number;
  /** Positivo: gastas más de lo normal. */
  diffCents: number;
}

export interface MonthComparison {
  /** Lo gastado este mes (hasta hoy, si es el mes en curso). */
  currentCents: number;
  /** Lo que sueles llevar gastado a estas alturas (o en todo el mes). */
  normalCents: number;
  diffCents: number;
  /** Día hasta el que se compara en el mes en curso; null si el mes ya terminó. */
  upToDay: number | null;
  /** Meses anteriores usados para «lo normal». */
  monthsUsed: number;
  /** El mismo mes del año pasado, comparado igual; null si no hay datos. */
  lastYearCents: number | null;
  /** Categorías que más se salen de lo normal (como mucho 3, de al menos 5 €). */
  categories: CategoryDiff[];
}

/**
 * Compara los gastos de `month` con la media de los meses anteriores que tienen movimientos
 * (hasta 6). En el mes en curso compara lo que llevas hasta hoy con lo que solías llevar a
 * ese mismo día, para no asustar a principios de mes. Con menos de 2 meses de historial no
 * hay «normal» todavía: null.
 */
export function compareWithNormal(entries: PersonalEntry[], month: string, todayIso: string): MonthComparison | null {
  const upToDay = monthOf(todayIso) === month ? day(todayIso) : null;
  const cut = upToDay ?? 31;
  const previous: MonthTotals[] = [];
  for (let i = 1; i <= 24 && previous.length < NORMAL_MONTHS; i++) {
    const t = totals(entries, addMonths(month, -i), cut);
    if (t.any) previous.push(t);
  }
  if (previous.length < 2) return null;
  const current = totals(entries, month, cut);
  const normalCents = Math.round(previous.reduce((s, t) => s + t.expenseCents, 0) / previous.length);
  const lastYear = totals(entries, addMonths(month, -12), cut);

  const names = new Set([...current.byCategory.keys(), ...previous.flatMap((t) => [...t.byCategory.keys()])]);
  const categories = [...names]
    .map((category) => {
      const currentCents = current.byCategory.get(category) ?? 0;
      const normal = Math.round(previous.reduce((s, t) => s + (t.byCategory.get(category) ?? 0), 0) / previous.length);
      return { category, currentCents, normalCents: normal, diffCents: currentCents - normal };
    })
    .filter((c) => Math.abs(c.diffCents) >= 500)
    .sort((a, b) => Math.abs(b.diffCents) - Math.abs(a.diffCents))
    .slice(0, 3);

  return {
    currentCents: current.expenseCents,
    normalCents,
    diffCents: current.expenseCents - normalCents,
    upToDay,
    monthsUsed: previous.length,
    lastYearCents: lastYear.expenseCents > 0 ? lastYear.expenseCents : null,
    categories,
  };
}

/* ───────────── Nota del mes ───────────── */

export type FactorKey = 'saving' | 'fixed' | 'limits' | 'cushion';

export interface ScoreFactor {
  key: FactorKey;
  label: string;
  points: number;
  max: number;
  /** Dato corto para enseñar debajo, p. ej. «12 %». */
  value: string;
}

export interface MonthScore {
  /** De 0 a 100. */
  score: number;
  level: 'genial' | 'bien' | 'regular' | 'flojo';
  /** true en el mes en curso: los gastos variables se estiman hasta fin de mes. */
  provisional: boolean;
  /** Lo que ahorras sobre lo que ingresas (de 0 a 1; negativo si gastas más). */
  savingRate: number;
  factors: ScoreFactor[];
  /** Como mucho 3 consejos, el más útil primero. */
  tips: string[];
}

export interface ScoreInput {
  entries: PersonalEntry[];
  recurring: PersonalRecurring[];
  budgets: PersonalBudget[];
  month: string;
  todayIso: string;
}

export type ScoreUnavailable = 'no-income' | 'too-early';

/**
 * Nota del 0 al 100 con cuatro partes:
 * - Ahorro (40): llegar a ahorrar el 20 % de lo que ingresas.
 * - Fijos (20): que los gastos fijos no pasen del 30 % de lo que ingresas (0 puntos al 60 %).
 * - Límites (20): categorías con límite que no te has pasado. Sin límites, la mitad.
 * - Colchón (20): meses que aguantarías sin ingresos, hasta 6.
 * En el mes en curso, los gastos que no son fijos se estiman hasta fin de mes al ritmo de hoy.
 */
export function monthScore({ entries, recurring, budgets, month, todayIso }: ScoreInput): MonthScore | ScoreUnavailable {
  const isCurrent = monthOf(todayIso) === month;
  if (isCurrent && day(todayIso) < SCORE_FROM_DAY) return 'too-early';
  const t = totals(entries, month);
  if (t.incomeCents <= 0) return 'no-income';

  const factor = isCurrent ? daysIn(month) / day(todayIso) : 1;
  const expenseCents = Math.round(t.expenseCents + t.variableCents * (factor - 1));
  const savedCents = t.incomeCents - expenseCents;
  const savingRate = savedCents / t.incomeCents;

  const fixedCents = recurring.filter((r) => r.active && r.kind === 'expense').reduce((s, r) => s + monthlyEquivalent(r), 0);
  const fixedRatio = fixedCents / t.incomeCents;

  const limited = budgets.filter((b) => b.amount_cents > 0);
  const over = limited
    .map((b) => ({ category: b.category, overCents: (t.byCategory.get(b.category) ?? 0) - b.amount_cents }))
    .filter((o) => o.overCents > 0)
    .sort((a, b) => b.overCents - a.overCents);

  const cushion = emergencyCushion(entries, month);

  const raw: ScoreFactor[] = [
    { key: 'saving', label: 'Ahorro', max: 40, points: 40 * clamp01(savingRate / 0.2), value: percent(Math.max(0, savingRate)) },
    { key: 'fixed', label: 'Fijos', max: 20, points: fixedCents === 0 ? 20 : 20 * clamp01((0.6 - fixedRatio) / 0.3), value: fixedCents === 0 ? 'Sin fijos' : percent(fixedRatio) },
    {
      key: 'limits',
      label: 'Límites',
      max: 20,
      points: limited.length === 0 ? 10 : (20 * (limited.length - over.length)) / limited.length,
      value: limited.length === 0 ? 'Sin poner' : `${limited.length - over.length}/${limited.length}`,
    },
    {
      key: 'cushion',
      label: 'Colchón',
      max: 20,
      points: 20 * clamp01((cushion.months ?? 0) / CUSHION_GOAL),
      value: cushion.months == null ? '—' : `${formatMonths(cushion.months)}`,
    },
  ];
  const factors = raw.map((f) => ({ ...f, points: Math.round(f.points) }));
  const score = Math.max(0, Math.min(100, factors.reduce((s, f) => s + f.points, 0)));
  const level = score >= 80 ? 'genial' : score >= 60 ? 'bien' : score >= 40 ? 'regular' : 'flojo';

  // Consejos: uno por cada parte que pierde puntos, empezando por la que más pierde.
  const tips: { lost: number; text: string }[] = [];
  const lost = (k: FactorKey) => {
    const f = factors.find((x) => x.key === k)!;
    return f.max - f.points;
  };
  if (savingRate < 0.2) {
    const biggest = [...t.variableByCategory.entries()].sort((a, b) => b[1] - a[1])[0];
    const where = biggest ? ` Tu mayor gasto que no es fijo es ${biggest[0]} (${formatEuros(biggest[1])}): es el sitio más fácil para recortar.` : '';
    const text =
      savingRate < 0
        ? `${isCurrent ? 'A este ritmo gastarás' : 'Has gastado'} ${formatEuros(-savedCents)} más de lo que ingresas.${where}`
        : `Ahorras el ${percent(savingRate)}. Para llegar al 20 % te faltan ${formatEuros(Math.round(t.incomeCents * 0.2 - savedCents))} al mes.${where}`;
    tips.push({ lost: lost('saving'), text });
  }
  if (fixedRatio > 0.3) {
    tips.push({
      lost: lost('fixed'),
      text: `Tus fijos se llevan el ${percent(fixedRatio)} de lo que ingresas (lo sano es menos del 30 %). Mira en «Lo que se repite» qué suscripción o cuota puedes quitar.`,
    });
  }
  if (limited.length === 0) {
    tips.push({ lost: lost('limits'), text: 'Ponte un límite al mes en 2 o 3 categorías, por ejemplo Comida fuera u Ocio. Lo que se mide, se controla.' });
  } else if (over.length > 0) {
    const o = over[0];
    tips.push({
      lost: lost('limits'),
      text: `Te has pasado ${formatEuros(o.overCents)} en ${o.category}${over.length > 1 ? ` y en ${over.length - 1} categoría${over.length > 2 ? 's' : ''} más` : ''}. Vigílala o ajusta el límite si se te quedó corto.`,
    });
  }
  if ((cushion.months ?? 0) < CUSHION_MIN && cushion.monthlyCents > 0) {
    tips.push({
      lost: lost('cushion'),
      text: `Tu colchón cubre ${formatMonths(cushion.months ?? 0)}. Apartando ${formatEuros(cushion.toMinPerMonthCents)} al mes, en un año tendrías ${CUSHION_MIN} meses de gastos guardados.`,
    });
  }
  const sorted = tips.sort((a, b) => b.lost - a.lost).map((x) => x.text);
  if (sorted.length < 3 && savingRate >= 0.2) {
    sorted.push(`Ahorras el ${percent(savingRate)} de lo que ingresas. Si lo mantienes, en un año habrás apartado unos ${formatEuros(Math.round(savedCents * 12))}.`);
  }
  if (sorted.length === 0) sorted.push('Todo en orden este mes. Sigue así.');

  return { score, level, provisional: isCurrent, savingRate, factors, tips: sorted.slice(0, 3) };
}

/** «1 mes», «2,5 meses», «menos de 1 mes». */
export function formatMonths(months: number): string {
  if (months > 0 && months < 0.95) return 'menos de 1 mes';
  const rounded = Math.round(months * 10) / 10;
  const text = rounded.toLocaleString('es-ES', { maximumFractionDigits: 1 });
  return `${text} ${rounded === 1 ? 'mes' : 'meses'}`;
}
