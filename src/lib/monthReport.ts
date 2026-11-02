import { balanceFor, owedOf, roundBalance } from './balance';
import { monthlySummary, totals } from './budget';
import { addDays, addMonths, monthOf } from './dates';
import { monthlyTotals } from './stats';
import type { HouseholdData } from './useHousehold';

/*
 * Datos del resumen mensual en PDF (src/lib/pdfReport.ts lo dibuja). Todo en céntimos y con
 * los nombres de cada uno, porque el PDF se comparte: no habla de «tú».
 */

/** Meses que salen en la gráfica de evolución (el del resumen incluido). */
export const REPORT_HISTORY = 6;

export interface ReportCategory {
  name: string;
  cents: number;
  /** Parte del gasto del mes (0..1). */
  share: number;
  budgetCents: number | null;
  previousCents: number;
  /** Media de los meses anteriores con gasto en la gráfica (0 si no hay). */
  averageCents: number;
}

export interface ReportPerson {
  name: string;
  /** Lo que adelantó (pagó) ese mes. */
  paidCents: number;
  /** Lo que le tocaba de los gastos del mes según el reparto. */
  shareCents: number;
}

export interface MonthReport {
  month: string;
  householdName: string;
  generatedOn: string;
  /** El mes aún no ha terminado: las cifras son hasta hoy. */
  inProgress: boolean;
  spentCents: number;
  count: number;
  budgetCents: number;
  budgetedSpentCents: number;
  fixedCents: number;
  previousSpentCents: number;
  /** Lo del mes anterior hasta el mismo día del mes (para comparar un mes a medias). */
  previousToDateCents: number;
  /** Media de los meses anteriores con gasto (de los de la gráfica) y cuántos son. */
  averageCents: number;
  averageMonths: number;
  history: { month: string; spentCents: number; budgetCents: number | null }[];
  categories: ReportCategory[];
  top: { date: string; note: string; category: string; cents: number; payer: string }[];
  people: ReportPerson[];
  settledCents: number;
  /** Saldo al cerrar el mes (o hoy, si está en curso): quién debe a quién. null = en paz o solo una persona. */
  balance: { from: string; to: string; cents: number } | null;
}

function monthEnd(month: string): string {
  return addDays(addMonths(month, 1), -1);
}

export function monthReport(data: HouseholdData, month: string, todayIso: string): MonthReport {
  const name = (id: string) => data.members.find((m) => m.user_id === id)?.display_name ?? 'Cuenta borrada';
  const catName = new Map(data.categories.map((c) => [c.id, c.name]));
  const expenses = data.expenses.filter((e) => monthOf(e.spent_on) === month);
  const rows = monthlySummary(month, data.categories, data.expenses, data.budgets);
  const sum = totals(rows);
  const archived = new Set(data.categories.filter((c) => c.archived).map((c) => c.id));
  const history = monthlyTotals(data.expenses, data.budgets, month, REPORT_HISTORY, '', archived).map((t) => ({
    month: t.month,
    spentCents: t.spentCents,
    budgetCents: t.budgetCents,
  }));
  const before = history.slice(0, -1).filter((h) => h.spentCents > 0);
  const averageCents = before.length ? Math.round(before.reduce((s, h) => s + h.spentCents, 0) / before.length) : 0;

  // Media por categoría en los mismos meses anteriores con gasto.
  const pastMonths = new Set(before.map((h) => h.month));
  const pastByCat = new Map<string, number>();
  for (const e of data.expenses) {
    if (!pastMonths.has(monthOf(e.spent_on))) continue;
    pastByCat.set(e.category_id, (pastByCat.get(e.category_id) ?? 0) + e.amount_cents);
  }
  const previous = addMonths(month, -1);
  const prevByCat = new Map(monthlySummary(previous, data.categories, data.expenses, data.budgets).map((r) => [r.category.id, r.spentCents]));

  const categories = rows
    .filter((r) => r.spentCents > 0)
    .map((r) => ({
      name: r.category.name,
      cents: r.spentCents,
      share: sum.spentCents ? r.spentCents / sum.spentCents : 0,
      budgetCents: r.budgetCents,
      previousCents: prevByCat.get(r.category.id) ?? 0,
      averageCents: before.length ? Math.round((pastByCat.get(r.category.id) ?? 0) / before.length) : 0,
    }));

  const top = [...expenses]
    .sort((a, b) => b.amount_cents - a.amount_cents || a.spent_on.localeCompare(b.spent_on))
    .slice(0, 5)
    .map((e) => ({
      date: e.spent_on,
      note: e.note?.trim() || catName.get(e.category_id) || 'Gasto',
      category: catName.get(e.category_id) ?? '',
      cents: e.amount_cents,
      payer: name(e.paid_by),
    }));

  const ids = [...new Set([...data.members.map((m) => m.user_id), ...expenses.map((e) => e.paid_by)])];
  const people =
    data.members.length > 1
      ? ids.map((id) => ({
          name: name(id),
          paidCents: expenses.reduce((s, e) => (e.paid_by === id ? s + e.amount_cents : s), 0),
          shareCents: Math.round(expenses.reduce((s, e) => s + (e.paid_by === id ? e.amount_cents - owedOf(e) : owedOf(e)), 0)),
        }))
      : [];

  const inProgress = month === monthOf(todayIso);
  const cutoff = inProgress ? todayIso : monthEnd(month);
  const settlements = data.settlements.filter((s) => monthOf(s.paid_on) === month);
  let balance: MonthReport['balance'] = null;
  if (data.members.length > 1) {
    const a = data.members[0].user_id;
    const b = data.members[1].user_id;
    const owedToA = roundBalance(
      balanceFor(a, data.expenses.filter((e) => e.spent_on <= cutoff), data.settlements.filter((s) => s.paid_on <= cutoff)),
    );
    if (owedToA > 0) balance = { from: name(b), to: name(a), cents: owedToA };
    else if (owedToA < 0) balance = { from: name(a), to: name(b), cents: -owedToA };
  }

  return {
    month,
    householdName: data.household.name,
    generatedOn: todayIso,
    inProgress,
    spentCents: sum.spentCents,
    count: expenses.length,
    budgetCents: sum.budgetCents,
    budgetedSpentCents: sum.budgetedSpentCents,
    fixedCents: expenses.reduce((s, e) => (e.recurring_id ? s + e.amount_cents : s), 0),
    previousSpentCents: history[history.length - 2]?.spentCents ?? 0,
    previousToDateCents: data.expenses.reduce(
      (s, e) => (monthOf(e.spent_on) === previous && Number(e.spent_on.slice(8)) <= Number(cutoff.slice(8)) ? s + e.amount_cents : s),
      0,
    ),
    averageCents,
    averageMonths: before.length,
    history,
    categories,
    top,
    people,
    settledCents: settlements.reduce((s, x) => s + x.amount_cents, 0),
    balance,
  };
}

/** "+12 %", "−8 %" o null si no hay con qué comparar. */
export function changeText(now: number, before: number): string | null {
  if (before <= 0) return null;
  const pct = Math.round(((now - before) / before) * 100);
  if (pct === 0) return 'igual';
  return `${pct > 0 ? '+' : '−'}${Math.abs(pct)} %`;
}

/** Nombre del archivo: "resumen-2026-10.pdf". */
export function reportFileName(month: string): string {
  return `resumen-${month.slice(0, 7)}.pdf`;
}
