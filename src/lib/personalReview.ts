import { addDays, formatShortDay } from './dates';
import { formatEuros } from './money';
import { monthlyEquivalent, nextDate, recurringDate } from './recurring';
import { normalize } from './search';
import type { PersonalEntry, PersonalRecurring } from './types';

/*
 * Repaso de los gastos personales: lo que se repite (suscripciones y pagos), los avisos
 * (cobros duplicados, renovaciones anuales, pruebas que pasan a ser de pago, comisiones del
 * banco) y los gastos hormiga. Solo usa lo apuntado en Personal (también lo importado del
 * extracto del banco). Nada se da por hecho: si un dato no basta, va con `review` (“Revisar”).
 */

export type Period = 'weekly' | 'monthly' | 'quarterly' | 'yearly';

export interface RepeatingPayment {
  /** Único entre pagos y gastos hormiga (para el simulador). */
  key: string;
  name: string;
  category: string;
  /** null = solo ha salido una vez y no se sabe cada cuánto se cobra. */
  period: Period | null;
  /** Veces que se ha cobrado. */
  count: number;
  lastOn: string;
  lastCents: number;
  /** Lo que cuesta al mes según los últimos cobros (null si no se sabe). */
  monthlyCents: number | null;
  yearlyCents: number | null;
  /** Por qué hay que revisarlo; null si está claro. */
  review: string | null;
  /** Es un fijo que creaste tú en la app. */
  fixed: boolean;
}

export interface SmallHabit {
  key: string;
  name: string;
  category: string;
  /** Veces en el último año. */
  count: number;
  /** Primera vez en el último año: el cálculo del año sale de lo gastado desde entonces. */
  sinceOn: string;
  averageCents: number;
  /** Lo que ha sumado en esos días. */
  totalCents: number;
  /** A este ritmo. */
  monthlyCents: number;
  yearlyCents: number;
  review: string | null;
}

export type AlertKind = 'duplicate' | 'annual' | 'trial' | 'fee';

export interface PersonalAlert {
  key: string;
  kind: AlertKind;
  name: string;
  /** Fecha del cobro (o de la próxima renovación en los anuales). */
  date: string;
  amountCents: number;
  text: string;
  review: boolean;
}

export interface PersonalReview {
  payments: RepeatingPayment[];
  habits: SmallHabit[];
  alerts: PersonalAlert[];
  /** Pagos claros, sin los de revisar. */
  monthlyCents: number;
  yearlyCents: number;
  /** Lo que sumarían al mes los pagos marcados para revisar. */
  reviewMonthlyCents: number;
  habitsYearlyCents: number;
  /** Comisiones del banco en el último año. */
  feesYearCents: number;
}

const PERIOD_DAYS: Record<Period, number> = { weekly: 7, monthly: 30.4, quarterly: 91, yearly: 365 };
const PER_MONTH: Record<Period, number> = { weekly: 52 / 12, monthly: 1, quarterly: 1 / 3, yearly: 1 / 12 };
// Margen de días entre cobros para cada frecuencia.
const RANGES: [Period, number, number][] = [
  ['weekly', 5, 9],
  ['monthly', 24, 37],
  ['quarterly', 80, 100],
  ['yearly', 330, 400],
];

/** Lo que cuesta como máximo cada vez un gasto hormiga. */
export const SMALL_MAX_CENTS = 1000;

const SUBSCRIPTION = /netflix|spotify|hbo|\bmax\b|disney|prime|amazon music|icloud|apple|google (one|play)|youtube|dazn|filmin|movistar|audible|kindle|crunchyroll|playstation|xbox|nintendo|chatgpt|openai|microsoft|office|adobe|dropbox|gimnasio|\bgym\b|basic ?fit|duolingo|tinder|patreon|twitch/;
const ANNUAL_WORD = /anual|annual|yearly|renovacion|renewal/;
const TRIAL_WORD = /prueba|trial|free/;
const FEE = /comision|comisiones/;
const FEE_MAYBE = /mantenimiento|cuota (anual )?(de )?tarjeta|descubierto|intereses deudores|posicion deudora|gastos de correo/;
// Aportaciones a fondos o traspasos: son ahorro, no comisiones.
const NOT_FEE = /inversion|fondos?\b|traspaso/;
const BIZUM = /^bizum\b/;
const RETENTION = /retencion/;

const days = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 86400000);
const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const avg = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / xs.length;

/** Clave para agrupar el mismo concepto aunque el banco añada números ("Netflix 12345"). */
export function conceptKey(note: string | null): string {
  if (!note) return '';
  return normalize(note).replace(/\d+/g, ' ').replace(/[^a-z+ ]/g, ' ').replace(/\s+/g, ' ').trim();
}

function periodOf(gap: number): Period | null {
  return RANGES.find(([, lo, hi]) => gap >= lo && gap <= hi)?.[0] ?? null;
}

function inRange(period: Period, gap: number) {
  const [, lo, hi] = RANGES.find(([p]) => p === period)!;
  return gap >= lo && gap <= hi;
}

/** Quita los cobros repetidos (mismo importe y como mucho 3 días después) para calcular la frecuencia. */
function withoutDuplicates(list: PersonalEntry[]): PersonalEntry[] {
  const out: PersonalEntry[] = [];
  for (const e of list) {
    const prev = out[out.length - 1];
    if (prev && prev.amount_cents === e.amount_cents && days(prev.entry_on, e.entry_on) <= 3) continue;
    out.push(e);
  }
  return out;
}

function addYear(iso: string): string {
  return recurringDate(iso, 'yearly', 1);
}

export function personalReview(entries: PersonalEntry[], recurring: PersonalRecurring[], todayIso: string): PersonalReview {
  const shortDate = (iso: string) => formatShortDay(iso, todayIso);
  const since = addDays(todayIso, -760);
  const yearAgo = addDays(todayIso, -365);
  const expenses = entries
    .filter((e) => e.kind === 'expense' && e.entry_on <= todayIso && e.entry_on >= since)
    .sort((a, b) => a.entry_on.localeCompare(b.entry_on) || a.created_at.localeCompare(b.created_at));

  // Agrupar por concepto. Lo que no tiene nota se agrupa por categoría, solo para gastos hormiga.
  const groups = new Map<string, PersonalEntry[]>();
  for (const e of expenses) {
    const c = conceptKey(e.note);
    const key = c.length >= 3 ? c : 'cat:' + normalize(e.category);
    groups.set(key, [...(groups.get(key) ?? []), e]);
  }
  const nameOf = (list: PersonalEntry[]) => list[list.length - 1].note?.trim() || list[list.length - 1].category;

  const payments: RepeatingPayment[] = [];
  const alerts: PersonalAlert[] = [];

  // 1. Fijos que creaste tú: se sabe lo que cuestan.
  const fixedKeys = new Set<string>();
  for (const r of recurring) {
    if (r.kind !== 'expense' || !r.active) continue;
    const key = conceptKey(r.note);
    if (key) fixedKeys.add(key);
    const monthly = Math.round(monthlyEquivalent(r));
    const period: Period = r.frequency;
    const generated = expenses.filter((e) => e.recurring_id === r.id);
    payments.push({
      key: 'f:' + r.id,
      name: r.note?.trim() || r.category,
      category: r.category,
      period,
      count: generated.length,
      lastOn: generated[generated.length - 1]?.entry_on ?? r.start_on,
      lastCents: r.amount_cents,
      monthlyCents: monthly,
      yearlyCents: Math.round(monthly * 12),
      review: null,
      fixed: true,
    });
    if (r.frequency === 'yearly') {
      alerts.push({
        key: 'annual:f:' + r.id,
        kind: 'annual',
        name: r.note?.trim() || r.category,
        date: nextDate(r),
        amountCents: r.amount_cents,
        text: 'Es un gasto fijo anual tuyo.',
        review: false,
      });
    }
  }

  // 2. Lo que se repite en lo apuntado (sin contar lo que apuntan los fijos).
  const paymentKeys = new Set<string>();
  for (const [key, all] of groups) {
    if (key.startsWith('cat:') || fixedKeys.has(key)) continue;
    const own = all.filter((e) => !e.recurring_id);
    const list = withoutDuplicates(own);
    if (list.length === 0) continue;
    // Muchas compras iguales en pocos días (el café de cada día) no son un pago que se repite.
    if (own.length > list.length * 1.5) continue;
    const name = nameOf(list);
    const last = list[list.length - 1];

    if (list.length === 1) {
      if (!SUBSCRIPTION.test(key) && normalize(last.category) !== 'suscripciones') continue;
      paymentKeys.add(key);
      payments.push({
        key: 'p:' + key, name, category: last.category, period: null, count: 1, lastOn: last.entry_on, lastCents: last.amount_cents,
        monthlyCents: null, yearlyCents: null, review: 'Solo aparece una vez: no se sabe si se cobra cada mes o cada año.', fixed: false,
      });
      if (ANNUAL_WORD.test(key)) {
        alerts.push({
          key: 'annual:' + key, kind: 'annual', name, date: addYear(last.entry_on), amountCents: last.amount_cents,
          text: `Parece anual por el concepto. Se cobró el ${shortDate(last.entry_on)}.`,
          review: true,
        });
      }
      continue;
    }

    const gaps = list.slice(1).map((e, i) => days(list[i].entry_on, e.entry_on));
    const period = periodOf(median(gaps));
    if (!period) continue;
    // Si empezó casi gratis (una prueba), ese primer cobro no cuenta para el importe.
    const charged = list[0].amount_cents <= 100 ? list.filter((e) => e.amount_cents > 100) : list;
    if (charged.length === 0) continue;
    const recent = charged.slice(-3).map((e) => e.amount_cents);
    const lastYear = charged.filter((e) => e.entry_on >= yearAgo).map((e) => e.amount_cents);
    const amounts = lastYear.length >= 2 ? lastYear : recent;
    const spread = Math.max(...amounts) / Math.min(...amounts);
    // Si el importe cambia mucho, no es una suscripción sino algo que se compra a menudo (el súper).
    if (spread > 1.5) continue;
    // Cada tres meses con solo dos cobros puede ser casualidad.
    if (period === 'quarterly' && list.length < 3) continue;
    // Cada semana y barato es más bien un gasto hormiga.
    if (period === 'weekly' && avg(recent) <= SMALL_MAX_CENTS) continue;

    const regular = gaps.filter((g) => inRange(period, g)).length;
    if (regular < gaps.length / 2) continue;
    const reasons: string[] = [];
    if (BIZUM.test(key)) reasons.push('es un Bizum a una persona, no una suscripción');
    if (RETENTION.test(key)) reasons.push('por el concepto parece una retención de impuestos del banco, no una suscripción');
    if (regular < gaps.length * 0.75) reasons.push('no siempre pasa el mismo tiempo entre cobros');
    if (list.length === 2 && period !== 'yearly') reasons.push('solo se ha cobrado dos veces');
    if (spread > 1.15) reasons.push('el importe cambia');
    const overdue = days(last.entry_on, todayIso) > PERIOD_DAYS[period] * 1.5 + 7;
    if (overdue) reasons.push('hace tiempo que no se cobra, puede que ya esté cancelado');

    const monthly = Math.round(avg(recent) * PER_MONTH[period]);
    paymentKeys.add(key);
    payments.push({
      key: 'p:' + key, name, category: last.category, period, count: list.length, lastOn: last.entry_on, lastCents: last.amount_cents,
      monthlyCents: monthly, yearlyCents: Math.round(monthly * 12),
      review: reasons.length ? capitalizeFirst(reasons.join('; ')) + '.' : null, fixed: false,
    });

    if (period === 'yearly' && !overdue) {
      alerts.push({
        key: 'annual:' + key, kind: 'annual', name, date: addYear(last.entry_on), amountCents: last.amount_cents,
        text: `Última vez el ${shortDate(last.entry_on)}. Se cobrará solo otra vez.`,
        review: reasons.length > 0,
      });
    }

    // Prueba que pasa a ser de pago: empezó casi gratis y luego cobra de verdad.
    const first = list[0];
    const paid = list.find((e) => e.amount_cents >= Math.max(300, first.amount_cents * 3));
    if (first.amount_cents <= 100 && paid) {
      alerts.push({
        key: 'trial:' + key, kind: 'trial', name, date: paid.entry_on, amountCents: paid.amount_cents,
        text: `Empezó en ${formatEuros(first.amount_cents)} (${shortDate(first.entry_on)}) y luego pasó a ${formatEuros(paid.amount_cents)}.`,
        review: true,
      });
    } else if (period !== 'yearly' && !overdue && (TRIAL_WORD.test(key) || isNew(first.entry_on, expenses[0]?.entry_on, todayIso))) {
      alerts.push({
        key: 'trial:' + key, kind: 'trial', name, date: first.entry_on, amountCents: first.amount_cents,
        text: TRIAL_WORD.test(key)
          ? 'El concepto habla de una prueba y ya se cobra.'
          : 'Empezó hace poco. Si era una prueba gratis, ya es de pago.',
        review: true,
      });
    }
  }

  // 3. Gastos hormiga: poco cada vez, muchas veces (al menos 5 veces y una vez al mes desde
  // que empezó). Se mira el último año.
  const habits: SmallHabit[] = [];
  const habitKeys = new Set<string>();
  for (const [key, all] of groups) {
    if (paymentKeys.has(key) || fixedKeys.has(key)) continue;
    const list = all.filter((e) => e.entry_on >= yearAgo && !e.recurring_id);
    if (list.length < 5) continue;
    const amounts = list.map((e) => e.amount_cents);
    if (median(amounts) > SMALL_MAX_CENTS) continue;
    const since = Math.max(30, days(list[0].entry_on, todayIso) + 1);
    if ((list.length * 30.4) / since < 1) continue;
    const total = amounts.reduce((s, x) => s + x, 0);
    const yearly = Math.round((total * 365) / since);
    const reasons: string[] = [];
    if (key.startsWith('cat:')) reasons.push(`junta gastos sin nota de «${list[0].category}», pueden ser cosas distintas`);
    if (BIZUM.test(key)) reasons.push('son Bizums a una persona, pueden ser cuentas a medias');
    if (since < 90) reasons.push(`empezó hace ${since} días, el cálculo del año es aproximado`);
    habitKeys.add(key);
    habits.push({
      key: 'h:' + key,
      name: key.startsWith('cat:') ? `${list[0].category} (sin nota)` : nameOf(list),
      category: list[list.length - 1].category,
      count: list.length,
      sinceOn: list[0].entry_on,
      averageCents: Math.round(total / list.length),
      totalCents: total,
      monthlyCents: Math.round(yearly / 12),
      yearlyCents: yearly,
      review: reasons.length ? capitalizeFirst(reasons.join('; ')) + '.' : null,
    });
  }

  // 4. Cobros duplicados: mismo concepto e importe con 3 días o menos de diferencia.
  for (const [key, all] of groups) {
    if (key.startsWith('cat:') || habitKeys.has(key)) continue;
    for (let i = 1; i < all.length; i++) {
      const a = all[i - 1];
      const b = all[i];
      if (a.amount_cents !== b.amount_cents || days(a.entry_on, b.entry_on) > 3 || b.entry_on < yearAgo) continue;
      // Si nada lo hace parecer un cobro fijo, solo avisa a partir de cierto importe.
      if (!paymentKeys.has(key) && !fixedKeys.has(key) && b.amount_cents < 2000) continue;
      const when = a.entry_on === b.entry_on ? 'el mismo día' : `el ${shortDate(a.entry_on)} y el ${shortDate(b.entry_on)}`;
      alerts.push({
        key: `dup:${a.id}:${b.id}`, kind: 'duplicate', name: nameOf([b]), date: b.entry_on, amountCents: b.amount_cents,
        text: `Mismo importe ${when}. ¿Cobro repetido o dos compras?`,
        review: true,
      });
    }
  }

  // 5. Comisiones del banco del último año.
  let feesYearCents = 0;
  for (const e of expenses) {
    if (e.entry_on < yearAgo) continue;
    const text = normalize(`${e.note ?? ''} ${e.category}`);
    const sure = FEE.test(text);
    if ((!sure && !FEE_MAYBE.test(text)) || NOT_FEE.test(text)) continue;
    if (sure) feesYearCents += e.amount_cents;
    alerts.push({
      key: 'fee:' + e.id, kind: 'fee', name: e.note?.trim() || e.category, date: e.entry_on, amountCents: e.amount_cents,
      text: sure ? 'Por el concepto, es una comisión.' : 'Por el concepto, parece un cargo del banco.',
      review: !sure,
    });
  }

  payments.sort((a, b) => (b.monthlyCents ?? -1) - (a.monthlyCents ?? -1));
  habits.sort((a, b) => b.yearlyCents - a.yearlyCents);
  alerts.sort((a, b) => b.date.localeCompare(a.date));
  const sure = payments.filter((p) => p.monthlyCents != null && !p.review);
  const monthlyCents = sure.reduce((s, p) => s + p.monthlyCents!, 0);
  return {
    payments,
    habits,
    alerts,
    monthlyCents,
    yearlyCents: sure.reduce((s, p) => s + p.yearlyCents!, 0),
    reviewMonthlyCents: payments.filter((p) => p.monthlyCents != null && p.review).reduce((s, p) => s + p.monthlyCents!, 0),
    habitsYearlyCents: habits.reduce((s, h) => s + h.yearlyCents, 0),
    feesYearCents,
  };
}

/** Lo que se ahorraría al cancelar lo marcado (claves de pagos y gastos hormiga). */
export function simulateSavings(review: PersonalReview, selected: ReadonlySet<string>): { monthlyCents: number; yearlyCents: number } {
  let monthlyCents = 0;
  let yearlyCents = 0;
  for (const x of [...review.payments, ...review.habits]) {
    if (!selected.has(x.key) || x.monthlyCents == null) continue;
    monthlyCents += x.monthlyCents;
    yearlyCents += x.yearlyCents!;
  }
  return { monthlyCents, yearlyCents };
}

// Empezó en los últimos 75 días y hay datos de al menos 60 días antes (si no, no se sabe si es nuevo).
function isNew(firstOn: string, dataFrom: string | undefined, todayIso: string): boolean {
  return !!dataFrom && days(firstOn, todayIso) <= 75 && days(dataFrom, firstOn) >= 60;
}

const capitalizeFirst = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
