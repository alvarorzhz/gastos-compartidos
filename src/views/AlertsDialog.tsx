import { useEffect, useState } from 'react';
import { budgetAlerts, type BudgetAlert } from '../lib/alerts';
import { formatMonth, monthOf, today } from '../lib/dates';
import { formatEuros } from '../lib/money';
import type { HouseholdData } from '../lib/useHousehold';
import { Sheet } from './common';

/** Tras cuánto tiempo en segundo plano se considera que se vuelve a entrar en la app. */
const REENTRY_MS = 30 * 60 * 1000;

/**
 * Al entrar en la app, muestra juntos los presupuestos de este mes que han llegado a su aviso.
 * Sale cada vez que se abre la app (y al volver tras un rato en segundo plano).
 */
export function AlertsOnEntry({ data, waiting = false }: { data: HouseholdData; waiting?: boolean }) {
  const [open, setOpen] = useState(true);

  useEffect(() => {
    let hiddenAt = 0;
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') hiddenAt = Date.now();
      else if (hiddenAt && Date.now() - hiddenAt >= REENTRY_MS) setOpen(true);
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, []);

  const month = monthOf(today());
  const alerts = budgetAlerts(month, data.categories, data.expenses, data.budgets);
  if (!open || waiting || alerts.length === 0) return null;

  return (
    <Sheet title="Avisos de presupuesto" onClose={() => setOpen(false)}>
      <div className="stack">
        <p className="muted small">{formatMonth(month)}: estas categorías han llegado al aviso que tienen configurado.</p>
        <ul className="list alert-list">
          {alerts.map((a) => (
            <AlertRow key={a.category.id} alert={a} />
          ))}
        </ul>
        <p className="muted small">El porcentaje de aviso de cada categoría se cambia en Presupuesto.</p>
        <button className="primary" onClick={() => setOpen(false)} autoFocus>Entendido</button>
      </div>
    </Sheet>
  );
}

function AlertRow({ alert: a }: { alert: BudgetAlert }) {
  const over = a.spentCents > a.budgetCents;
  const left = a.budgetCents - a.spentCents;
  return (
    <li className="list-item static budget-line">
      <div className="row spread">
        <span className="title">{over ? '🚨' : '⚠️'} {a.category.name}</span>
        <span>
          {formatEuros(a.spentCents)} / {formatEuros(a.budgetCents)}
        </span>
      </div>
      <div className={'progress ' + (over ? 'over' : 'warn')}>
        <div style={{ width: `${Math.min(a.percent, 100)}%` }} />
      </div>
      <div className={'small ' + (over ? 'negative' : 'muted')}>
        {over ? `Os habéis pasado ${formatEuros(-left)}` : `Quedan ${formatEuros(left)}`} · {a.percent} % · aviso al {a.category.alert_percent} %
      </div>
    </li>
  );
}
