import { owedOf } from './balance';
import { monthlySummary } from './budget';
import { downloadFile } from './csv';
import { addMonths, formatMonth, monthOf, today } from './dates';
import { nameOf } from './people';
import { goalProgress } from './savings';
import type { HouseholdData } from './useHousehold';
import { buildXlsx, type Sheet } from './xlsxWrite';

const money = (cents: number) => ({ cents });
const date = (iso: string) => ({ date: iso });

/** Hojas del Excel: gastos, reembolsos, presupuestos, huchas y lo personal de quien exporta. */
export function exportSheets(data: HouseholdData, todayIso = today()): Sheet[] {
  const category = new Map(data.categories.map((c) => [c.id, c.name]));
  const who = (id: string) => nameOf(data.members, id);
  const goalName = new Map(data.goals.map((g) => [g.id, g.name]));

  // Presupuestos mes a mes, desde el primer mes con presupuesto o gasto hasta el actual.
  const firstMonth = [...data.budgets.map((b) => b.month), ...data.expenses.map((e) => monthOf(e.spent_on))].sort()[0];
  const budgetRows: Sheet['rows'] = [];
  for (let m = monthOf(todayIso); firstMonth && m >= firstMonth; m = addMonths(m, -1)) {
    for (const r of monthlySummary(m, data.categories, data.expenses, data.budgets)) {
      if (r.budgetCents == null && r.spentCents === 0) continue;
      budgetRows.push([formatMonth(m), r.category.name, r.budgetCents != null ? money(r.budgetCents) : null, money(r.spentCents), r.budgetCents != null ? money(r.budgetCents - r.spentCents) : null]);
    }
  }

  return [
    {
      name: 'Gastos',
      headers: ['Fecha', 'Concepto', 'Categoría', 'Importe', 'Pagó', 'Parte de quien no pagó', 'Reparto', 'Gasto fijo', 'Apuntado por'],
      widths: [12, 30, 18, 12, 14, 22, 14, 11, 14],
      rows: data.expenses.map((e) => [
        date(e.spent_on), e.note, category.get(e.category_id) ?? '', money(e.amount_cents), who(e.paid_by),
        money(owedOf(e)), e.owed_cents == null ? 'A medias' : 'Personalizado', e.recurring_id ? 'Sí' : '', e.created_by ? who(e.created_by) : '',
      ]),
    },
    {
      name: 'Reembolsos',
      headers: ['Fecha', 'Importe', 'Devuelve', 'Recibe', 'Nota'],
      widths: [12, 12, 14, 14, 30],
      rows: data.settlements.map((s) => [date(s.paid_on), money(s.amount_cents), who(s.from_user), who(s.to_user), s.note]),
    },
    {
      name: 'Presupuestos',
      headers: ['Mes', 'Categoría', 'Límite', 'Gastado', 'Queda'],
      widths: [18, 18, 12, 12, 12],
      rows: budgetRows,
    },
    {
      name: 'Huchas',
      headers: ['Hucha', 'Objetivo', 'Ahorrado', 'Estado'],
      widths: [24, 12, 12, 12],
      rows: data.goals.map((g) => [g.name, money(g.target_cents), money(goalProgress(g, data.contributions).savedCents), g.archived ? 'Archivada' : 'Activa']),
    },
    {
      name: 'Movimientos de huchas',
      headers: ['Fecha', 'Hucha', 'Quién', 'Importe', 'Nota'],
      widths: [12, 24, 14, 12, 30],
      rows: data.contributions.map((c) => [date(c.contributed_on), goalName.get(c.goal_id) ?? '', who(c.user_id), money(c.amount_cents), c.note]),
    },
    {
      // Lo personal solo incluye lo tuyo (es lo único que la app puede leer).
      name: 'Personal (solo tuyo)',
      headers: ['Fecha', 'Tipo', 'Categoría', 'Importe', 'Nota'],
      widths: [12, 10, 18, 12, 30],
      rows: data.personal.map((p) => [date(p.entry_on), p.kind === 'income' ? 'Ingreso' : 'Gasto', p.category, money(p.amount_cents), p.note]),
    },
  ];
}

/** Un Excel con una hoja para cada cosa. */
export function exportXlsx(data: HouseholdData) {
  const bytes = buildXlsx(exportSheets(data));
  downloadFile(`gastos-compartidos-${today()}.xlsx`, bytes, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
}

/** Copia completa en JSON (todo lo que la app guarda del espacio). */
export function exportJson(data: HouseholdData) {
  const payload = { exported_at: new Date().toISOString(), ...data };
  downloadFile(`gastos-compartidos-${today()}.json`, JSON.stringify(payload, null, 2), 'application/json');
}
