import { useId, useState, type FormEvent } from 'react';
import { ALERT_OPTIONS, alertText, budgetAlerts } from '../lib/alerts';
import { monthlySummary, totals, type BudgetRow } from '../lib/budget';
import { addMonths, formatMonth, monthOf, today } from '../lib/dates';
import { centsToInput, formatEuros, parseEuros } from '../lib/money';
import { errorMessage, supabase } from '../lib/supabase';
import type { AlertPercent } from '../lib/types';
import { AmountField, CategoryIcon, MonthNav, Notice, Progress, SectionHeader, Segmented, Sheet, toast, type ViewProps  } from './common';
import { Icon } from './icons';
import { MonthCloseSheet } from './MonthClose';
import Savings from './Savings';

export default function BudgetView(props: ViewProps) {
  const { data, reload } = props;
  const [month, setMonth] = useState(monthOf(today()));
  const [busy, setBusy] = useState(false);
  const [showClose, setShowClose] = useState(false);
  const [editing, setEditing] = useState<BudgetRow | null>(null);
  const rows = monthlySummary(month, data.categories, data.expenses, data.budgets);
  const sum = totals(rows);
  const previous = addMonths(month, -1);
  const previousBudgets = data.budgets.filter((b) => b.month === previous);
  const hasBudget = data.budgets.some((b) => b.month === month);
  const isCurrent = month === monthOf(today());
  const alerts = isCurrent ? budgetAlerts(month, data.categories, data.expenses, data.budgets) : [];
  const left = sum.budgetCents - sum.spentCents;
  const ratio = sum.budgetCents > 0 ? sum.spentCents / sum.budgetCents : 0;
  const status = sum.budgetCents <= 0 ? null : ratio > 1 ? 'over' : ratio >= 0.85 ? 'warn' : 'ok';

  async function copyPrevious() {
    setBusy(true);
    const { error } = await supabase
      .from('budgets')
      .upsert(previousBudgets.map((b) => ({ ...b, month })));
    setBusy(false);
    if (error) toast(errorMessage(error), 'error');
    else toast('Presupuesto copiado del mes anterior');
    await reload();
  }

  return (
    <>
      <MonthNav month={month} onChange={setMonth} />

      <section className="card hero" aria-label={`Presupuesto de ${formatMonth(month)}`}>
        <div className="hero-top">
          <div className="hero-label">
            <p className="stat-label">{left >= 0 || !hasBudget ? 'Presupuesto restante' : 'Por encima del presupuesto'}</p>
            {status && (
              <span className={'status-pill status-' + status}>
                <Icon name={status === 'ok' ? 'check' : 'alert'} size={15} />
                {status === 'ok' ? 'Dentro del presupuesto' : status === 'warn' ? 'Cerca del límite' : 'Por encima'}
              </span>
            )}
          </div>
          <p className={'stat-big' + (hasBudget && left < 0 ? ' negative' : '')}>{hasBudget ? formatEuros(Math.abs(left)) : '—'}</p>
        </div>
        {sum.budgetCents > 0 && <Progress value={sum.spentCents} max={sum.budgetCents} label="Presupuesto gastado" />}
        <div className={'stat-grid' + (sum.budgetCents > 0 ? ' three' : '')}>
          <div className="stat-tile">
            <span className="stat-label">Presupuesto</span>
            <strong>{sum.budgetCents ? formatEuros(sum.budgetCents) : 'Sin poner'}</strong>
          </div>
          <div className="stat-tile">
            <span className="stat-label">Gastado</span>
            <strong>{formatEuros(sum.spentCents)}</strong>
          </div>
          {sum.budgetCents > 0 && (
            <div className="stat-tile">
              <span className="stat-label">Usado</span>
              <strong>{Math.round(ratio * 100)} %</strong>
            </div>
          )}
        </div>
        {!hasBudget && (
          <Notice
            action={previousBudgets.length > 0 && (
              <button className="sm tinted" onClick={copyPrevious} disabled={busy}>{busy ? 'Copiando…' : 'Copiar el anterior'}</button>
            )}
          >
            Aún no hay presupuesto para este mes. Toca una categoría de abajo para ponerle un límite
            {previousBudgets.length > 0 ? ', o copia el del mes anterior.' : '.'}
          </Notice>
        )}
        <div className="row wrap">
          <button className="pill" onClick={() => setShowClose(true)}><Icon name="list" size={16} /> Resumen del mes</button>
          <button className="pill" onClick={() => (location.hash = '#graficos')}><Icon name="chart" size={16} /> Ver evolución</button>
        </div>
      </section>

      {alerts.length > 0 && (
        <div className="stack-sm" aria-label="Avisos de presupuesto">
          {alerts.map((a) => (
            <Notice key={a.category.id} kind={a.spentCents > a.budgetCents ? 'over' : 'warn'}>{alertText(a)}</Notice>
          ))}
        </div>
      )}

      <section className="section" aria-labelledby="budget-categories">
        <SectionHeader id="budget-categories" title="Por categoría" />
        <ul className="list with-icons">
          {rows.map((r) => (
            <BudgetLine key={r.category.id + month} row={r} onOpen={() => setEditing(r)} />
          ))}
        </ul>
        <p className="muted small" style={{ padding: '0 var(--s1)' }}>
          Toca una categoría para cambiar su presupuesto o cuándo avisar. Los avisos salen al abrir la app y en Inicio.
        </p>
      </section>

      <Savings {...props} />

      {editing && <BudgetSheet {...props} month={month} row={editing} onClose={() => setEditing(null)} />}
      {showClose && <MonthCloseSheet {...props} month={month} onClose={() => setShowClose(false)} />}
    </>
  );
}

function BudgetLine({ row, onOpen }: { row: BudgetRow; onOpen: () => void }) {
  const budget = row.budgetCents;
  const left = budget != null ? budget - row.spentCents : 0;
  const pct = budget ? Math.round((row.spentCents * 100) / budget) : 0;
  return (
    <li>
      <button className="row-item budget-item" onClick={onOpen} aria-label={`${row.category.name}: ${formatEuros(row.spentCents)}${budget != null ? ` de ${formatEuros(budget)}` : ', sin presupuesto'}. Cambiar presupuesto`}>
        <span className="row-top">
          <CategoryIcon name={row.category.name} />
          <span className="row-main">
            <span className="row-title">
              {row.category.name}
              {row.category.archived && <> <span className="tag">Archivada</span></>}
            </span>
            <span className="row-meta">{budget != null ? `${formatEuros(row.spentCents)} de ${formatEuros(budget)}` : `${formatEuros(row.spentCents)} · sin presupuesto`}</span>
          </span>
          {budget == null ? (
            <span className="link-btn small">Poner</span>
          ) : (
            <span className={'row-amount ' + (left < 0 ? 'negative' : '')}>{pct} %</span>
          )}
        </span>
        {budget != null && budget > 0 && (
          <>
            <Progress value={row.spentCents} max={budget} label={`Presupuesto de ${row.category.name}`} />
            <span className="budget-foot">
              <span className={left < 0 ? 'negative' : ''}>{left >= 0 ? `Quedan ${formatEuros(left)}` : `Os habéis pasado ${formatEuros(-left)}`}</span>
              <span>{row.category.alert_percent ? `Aviso al ${row.category.alert_percent} %` : 'Sin aviso'}</span>
            </span>
          </>
        )}
      </button>
    </li>
  );
}

type AlertValue = '80' | '90' | '100' | 'none';
const toAlertValue = (v: AlertPercent | null): AlertValue => (v == null ? 'none' : (String(v) as AlertValue));

function BudgetSheet({ data, reload, month, row, onClose }: ViewProps & { month: string; row: BudgetRow; onClose: () => void }) {
  const formId = useId();
  const [value, setValue] = useState(row.budgetCents != null ? centsToInput(row.budgetCents) : '');
  const [alertValue, setAlertValue] = useState<AlertValue>(toAlertValue(row.category.alert_percent));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(cents: number | null, alert: AlertValue) {
    setBusy(true);
    setError(null);
    const key = { household_id: data.household.id, category_id: row.category.id, month };
    if (cents !== row.budgetCents) {
      const { error } =
        cents == null
          ? await supabase.from('budgets').delete().match(key)
          : await supabase.from('budgets').upsert({ ...key, amount_cents: cents });
      if (error) {
        setBusy(false);
        return setError(errorMessage(error));
      }
    }
    if (alert !== toAlertValue(row.category.alert_percent)) {
      const { error } = await supabase
        .from('categories')
        .update({ alert_percent: alert === 'none' ? null : (Number(alert) as AlertPercent) })
        .eq('id', row.category.id);
      if (error) {
        setBusy(false);
        await reload();
        return setError(errorMessage(error));
      }
    }
    await reload();
    setBusy(false);
    toast(cents == null && row.budgetCents != null ? 'Presupuesto quitado' : 'Presupuesto guardado');
    onClose();
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    const trimmed = value.trim();
    const cents = trimmed === '' ? null : parseEuros(trimmed);
    if (trimmed !== '' && cents == null) return setError('Escribe un importe válido, por ejemplo 300 o 250,50');
    void save(cents, alertValue);
  }

  return (
    <Sheet
      title={row.category.name}
      subtitle={`${formatMonth(month)} · lleváis ${formatEuros(row.spentCents)}`}
      onClose={onClose}
      footer={
        <>
          {error && <p className="error" role="alert">{error}</p>}
          <div className="row">
            {row.budgetCents != null && (
              <button type="button" className="danger" disabled={busy} onClick={() => save(null, alertValue)}>Quitar</button>
            )}
            <button type="submit" form={formId} className="primary lg" disabled={busy}>{busy ? 'Guardando…' : 'Guardar'}</button>
          </div>
        </>
      }
    >
      <form id={formId} onSubmit={submit} className="stack" noValidate>
        <AmountField label="Límite para este mes" value={value} onChange={setValue} autoFocus />
        <Segmented
          legend="Avisar al llegar al"
          value={alertValue}
          options={ALERT_OPTIONS.map((o) => ({ value: toAlertValue(o.value), label: o.value == null ? 'No avisar' : o.label }))}
          onChange={setAlertValue}
        />
        <p className="field-hint">El aviso de la categoría vale para todos los meses. Deja el límite vacío para quitar el presupuesto de este mes.</p>
      </form>
    </Sheet>
  );
}
