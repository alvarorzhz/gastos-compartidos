import { owedOf } from './balance';
import { downloadFile, toCsv } from './csv';
import { today } from './dates';
import { nameOf } from './people';
import type { HouseholdData } from './useHousehold';

const euros = (cents: number) => (cents / 100).toFixed(2).replace('.', ',');

/** Un único CSV con gastos y reembolsos, legible en Excel o Numbers. */
export function exportCsv(data: HouseholdData) {
  const category = new Map(data.categories.map((c) => [c.id, c.name]));
  const who = (id: string) => nameOf(data.members, id);
  const rows: (string | number | null)[][] = [
    ...data.expenses.map((e) => ['Gasto', e.spent_on, euros(e.amount_cents), category.get(e.category_id) ?? '', who(e.paid_by), '', euros(Math.round(owedOf(e))), e.note]),
    ...data.settlements.map((s) => ['Reembolso', s.paid_on, euros(s.amount_cents), '', who(s.from_user), who(s.to_user), '', s.note]),
  ].sort((a, b) => String(b[1]).localeCompare(String(a[1])));
  const csv = toCsv(['Tipo', 'Fecha', 'Importe (EUR)', 'Categoría', 'Pagó / Devuelve', 'Recibe', 'Parte de quien no pagó (EUR)', 'Nota'], rows);
  downloadFile(`gastos-compartidos-${today()}.csv`, csv, 'text/csv;charset=utf-8');
}

/** Copia completa en JSON (todo lo que la app guarda del espacio). */
export function exportJson(data: HouseholdData) {
  const payload = { exported_at: new Date().toISOString(), ...data };
  downloadFile(`gastos-compartidos-${today()}.json`, JSON.stringify(payload, null, 2), 'application/json');
}
