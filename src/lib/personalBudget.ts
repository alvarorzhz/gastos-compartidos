import { addMonths, monthOf } from './dates';
import type { PersonalBudget, PersonalEntry } from './types';

/*
 * Presupuesto personal: un límite al mes por categoría (vale todos los meses hasta que se
 * cambie), y la evolución de ingresos y gastos con su tendencia probable.
 */

export interface BudgetRow {
  category: string;
  spentCents: number;
  /** null = sin límite. */
  limitCents: number | null;
}

/** Lo gastado en cada categoría del mes junto a su límite. Primero las que tienen límite. */
export function budgetRows(entries: PersonalEntry[], budgets: PersonalBudget[], month: string): BudgetRow[] {
  const spent = new Map<string, number>();
  for (const e of entries) {
    if (e.kind !== 'expense' || monthOf(e.entry_on) !== month) continue;
    spent.set(e.category, (spent.get(e.category) ?? 0) + e.amount_cents);
  }
  const limits = new Map(budgets.map((b) => [b.category, b.amount_cents]));
  const names = new Set([...limits.keys(), ...spent.keys()]);
  return [...names]
    .map((category) => ({ category, spentCents: spent.get(category) ?? 0, limitCents: limits.get(category) ?? null }))
    .sort((a, b) => Number(b.limitCents != null) - Number(a.limitCents != null) || b.spentCents - a.spentCents);
}

/** Aviso a partir de este porcentaje del límite (igual que el presupuesto común por defecto). */
export const ALERT_AT = 0.9;

/** Categorías que han llegado al aviso o se han pasado. */
export function budgetAlerts(rows: BudgetRow[]): BudgetRow[] {
  return rows.filter((r) => r.limitCents != null && r.spentCents >= r.limitCents * ALERT_AT);
}

/**
 * Límite que se propone para una categoría: la media de lo gastado en los tres meses
 * anteriores (los que tienen gasto), redondeada a 5 €. null si no hay gastos.
 */
export function suggestedLimit(entries: PersonalEntry[], category: string, month: string): number | null {
  const months = [1, 2, 3].map((i) => addMonths(month, -i));
  const sums = months.map((m) =>
    entries.filter((e) => e.kind === 'expense' && e.category === category && monthOf(e.entry_on) === m).reduce((s, e) => s + e.amount_cents, 0),
  );
  const active = sums.filter((x) => x > 0);
  if (active.length === 0) return null;
  const avg = active.reduce((s, x) => s + x, 0) / active.length;
  return Math.max(500, Math.round(avg / 500) * 500);
}

export interface MonthFlow {
  month: string; // YYYY-MM-01
  incomeCents: number;
  expenseCents: number;
}

/** Ingresos y gastos de los últimos `count` meses hasta `lastMonth` (solo de una categoría de gasto, si se pide). */
export function monthlyFlows(entries: PersonalEntry[], lastMonth: string, count: number, category = ''): MonthFlow[] {
  const months = Array.from({ length: count }, (_, i) => addMonths(lastMonth, i - count + 1));
  const by = new Map(months.map((m) => [m, { month: m, incomeCents: 0, expenseCents: 0 }]));
  for (const e of entries) {
    const row = by.get(monthOf(e.entry_on));
    if (!row) continue;
    if (e.kind === 'income') {
      if (!category) row.incomeCents += e.amount_cents;
    } else if (!category || e.category === category) {
      row.expenseCents += e.amount_cents;
    }
  }
  return months.map((m) => by.get(m)!);
}

export interface Trend {
  /** Previsión para los próximos meses, del más cercano al más lejano. */
  next: number[];
  direction: 'up' | 'down' | 'flat';
  /** Meses completos usados para calcularla. */
  months: number;
}

/**
 * Tendencia probable a partir de los meses completos (sin el mes en curso): recta de mínimos
 * cuadrados sobre los últimos 6, sin bajar de cero. Con menos de 3 meses con datos no hay
 * tendencia: sería adivinar. «Estable» si cambia menos de un 3 % de la media al mes.
 */
export function trend(values: number[], ahead = 3): Trend | null {
  const start = values.findIndex((v) => v > 0);
  const series = start < 0 ? [] : values.slice(start).slice(-6);
  if (series.length < 3) return null;
  const n = series.length;
  const meanX = (n - 1) / 2;
  const meanY = series.reduce((s, v) => s + v, 0) / n;
  let num = 0;
  let den = 0;
  series.forEach((v, i) => {
    num += (i - meanX) * (v - meanY);
    den += (i - meanX) ** 2;
  });
  const slope = den ? num / den : 0;
  const next = Array.from({ length: ahead }, (_, k) => Math.max(0, Math.round(meanY + slope * (n - meanX + k))));
  const direction = Math.abs(slope) < meanY * 0.03 ? 'flat' : slope > 0 ? 'up' : 'down';
  return { next, direction, months: n };
}
