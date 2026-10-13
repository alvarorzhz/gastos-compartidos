import { useState } from 'react';
import { ALERT_OPTIONS } from '../lib/alerts';
import { monthlySummary, totals, type BudgetRow } from '../lib/budget';
import { addMonths, monthOf, today } from '../lib/dates';
import { centsToInput, formatEuros, parseEuros } from '../lib/money';
import { errorMessage, supabase } from '../lib/supabase';
import type { AlertPercent } from '../lib/types';
import { MonthNav, type ViewProps } from './common';
import { MonthCloseSheet } from './MonthClose';
import Savings from './Savings';

export default function BudgetView(props: ViewProps) {
  const { data, reload } = props;
  const [month, setMonth] = useState(monthOf(today()));
  const [busy, setBusy] = useState(false);
  const [showClose, setShowClose] = useState(false);
  const rows = monthlySummary(month, data.categories, data.expenses, data.budgets);
  const sum = totals(rows);
  const previous = addMonths(month, -1);
  const previousBudgets = data.budgets.filter((b) => b.month === previous);
  const hasBudget = data.budgets.some((b) => b.month === month);

  async function saveBudget(categoryId: string, cents: number | null) {
    const key = { household_id: data.household.id, category_id: categoryId, month };
    const { error } =
      cents == null
        ? await supabase.from('budgets').delete().match(key)
        : await supabase.from('budgets').upsert({ ...key, amount_cents: cents });
    if (error) alert(errorMessage(error));
    await reload();
  }

  async function saveAlert(categoryId: string, value: AlertPercent | null) {
    const { error } = await supabase.from('categories').update({ alert_percent: value }).eq('id', categoryId);
    if (error) alert(errorMessage(error));
    await reload();
  }

  async function copyPrevious() {
    setBusy(true);
    const { error } = await supabase
      .from('budgets')
      .upsert(previousBudgets.map((b) => ({ ...b, month })));
    setBusy(false);
    if (error) alert(errorMessage(error));
    await reload();
  }

  return (
    <>
      <MonthNav month={month} onChange={setMonth} />

      <section className="card">
        <div className="row spread">
          <span>Gastado</span>
          <strong>{formatEuros(sum.spentCents)}</strong>
        </div>
        <div className="row spread">
          <span>Presupuesto</span>
          <strong>{sum.budgetCents ? formatEuros(sum.budgetCents) : '—'}</strong>
        </div>
        {sum.budgetCents > 0 && <Progress spent={sum.spentCents} budget={sum.budgetCents} />}
        <button className="link small" onClick={() => setShowClose(true)}>📋 Ver resumen de este mes</button>
        {!hasBudget && previousBudgets.length > 0 && (
          <button className="secondary" onClick={copyPrevious} disabled={busy}>Copiar presupuesto del mes anterior</button>
        )}
      </section>

      <p className="muted small">
        Toca un presupuesto para cambiarlo. Déjalo vacío para quitarlo. En cada categoría con presupuesto puedes elegir
        cuándo avisar: la app lo muestra en Gastos al llegar a ese porcentaje.
      </p>
      <ul className="list">
        {rows.map((r) => (
          <BudgetLine
            key={r.category.id + month}
            row={r}
            onSave={(c) => saveBudget(r.category.id, c)}
            onAlert={(v) => saveAlert(r.category.id, v)}
          />
        ))}
      </ul>

      <Savings {...props} />
      {showClose && <MonthCloseSheet {...props} month={month} onClose={() => setShowClose(false)} />}
    </>
  );
}

function BudgetLine({ row, onSave, onAlert }: {
  row: BudgetRow;
  onSave: (cents: number | null) => Promise<void>;
  onAlert: (value: AlertPercent | null) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(row.budgetCents != null ? centsToInput(row.budgetCents) : '');
  const [invalid, setInvalid] = useState(false);

  async function commit() {
    const trimmed = value.trim();
    const cents = trimmed === '' ? null : parseEuros(trimmed);
    if (trimmed !== '' && cents == null) return setInvalid(true);
    setInvalid(false);
    setEditing(false);
    if (cents !== row.budgetCents) await onSave(cents);
  }

  return (
    <li className="list-item static budget-line">
      <div className="row spread">
        <span className="title">{row.category.name}{row.category.archived ? ' (archivada)' : ''}</span>
        <span>
          {formatEuros(row.spentCents)} /{' '}
          {editing ? (
            <input
              className={'inline-input' + (invalid ? ' invalid' : '')}
              inputMode="decimal"
              autoFocus
              value={value}
              onChange={(e) => setValue(e.target.value)}
              onBlur={commit}
              onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
              aria-label={`Presupuesto de ${row.category.name}`}
            />
          ) : (
            <button className="link" onClick={() => setEditing(true)}>
              {row.budgetCents != null ? formatEuros(row.budgetCents) : 'sin presupuesto'}
            </button>
          )}
        </span>
      </div>
      {row.budgetCents != null && row.budgetCents > 0 && (
        <>
          <Progress spent={row.spentCents} budget={row.budgetCents} />
          <label className="alert-select">
            Avisar al
            <select
              value={row.category.alert_percent ?? ''}
              onChange={(e) => onAlert(e.target.value ? (Number(e.target.value) as AlertPercent) : null)}
              aria-label={`Aviso de ${row.category.name}`}
            >
              {ALERT_OPTIONS.map((o) => (
                <option key={o.label} value={o.value ?? ''}>{o.label}</option>
              ))}
            </select>
          </label>
        </>
      )}
    </li>
  );
}

function Progress({ spent, budget }: { spent: number; budget: number }) {
  const ratio = spent / budget;
  const level = ratio > 1 ? 'over' : ratio > 0.85 ? 'warn' : 'ok';
  const left = budget - spent;
  return (
    <div>
      <div className={'progress ' + level} role="progressbar" aria-valuenow={Math.round(ratio * 100)} aria-valuemin={0} aria-valuemax={100}>
        <div style={{ width: `${Math.min(ratio, 1) * 100}%` }} />
      </div>
      <div className={'small ' + (left < 0 ? 'negative' : 'muted')}>
        {left >= 0 ? `Quedan ${formatEuros(left)}` : `Os habéis pasado ${formatEuros(-left)}`} · {Math.round(ratio * 100)} %
      </div>
    </div>
  );
}
