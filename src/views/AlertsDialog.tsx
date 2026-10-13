import { useEffect, useState } from 'react';
import { budgetAlerts, type BudgetAlert } from '../lib/alerts';
import { formatMonth, monthOf, today } from '../lib/dates';
import { formatEuros } from '../lib/money';
import type { HouseholdData } from '../lib/useHousehold';
import { CategoryIcon, Progress, Sheet } from './common';
import { Icon } from './icons';

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
    <Sheet
      title="Avisos de presupuesto"
      subtitle={`${formatMonth(month)}: estas categorías han llegado a su aviso.`}
      onClose={() => setOpen(false)}
      footer={<button className="primary lg block" onClick={() => setOpen(false)} autoFocus>Entendido</button>}
    >
      <div className="stack">
        <ul className="list with-icons">
          {alerts.map((a) => (
            <AlertRow key={a.category.id} alert={a} />
          ))}
        </ul>
        <p className="field-hint">El porcentaje de aviso de cada categoría se cambia en Presupuesto.</p>
      </div>
    </Sheet>
  );
}

function AlertRow({ alert: a }: { alert: BudgetAlert }) {
  const over = a.spentCents > a.budgetCents;
  const left = a.budgetCents - a.spentCents;
  return (
    <li className="row-item budget-item">
      <span className="row-top">
        <CategoryIcon name={a.category.name} />
        <span className="row-main">
          <span className="row-title">{a.category.name}</span>
          <span className="row-meta">{formatEuros(a.spentCents)} de {formatEuros(a.budgetCents)}</span>
        </span>
        <span className={'status-pill status-' + (over ? 'over' : 'warn')}>
          <Icon name="alert" size={14} /> {a.percent} %
        </span>
      </span>
      <Progress value={a.spentCents} max={a.budgetCents} label={`Presupuesto de ${a.category.name}`} />
      <span className="budget-foot">
        <span className={over ? 'negative' : ''}>{over ? `Os habéis pasado ${formatEuros(-left)}` : `Quedan ${formatEuros(left)}`}</span>
        <span>Aviso al {a.category.alert_percent} %</span>
      </span>
    </li>
  );
}
