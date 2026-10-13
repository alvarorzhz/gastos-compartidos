import { useState } from 'react';
import { addMonths, formatMonth, monthOf, today } from '../lib/dates';
import { formatEuros } from '../lib/money';
import { monthClose } from '../lib/monthClose';
import { nameOf, partnerOf } from '../lib/people';
import { Sheet, type ViewProps } from './common';

const SEEN_KEY = 'gastos.cierreVisto';

function readSeen(): string | null {
  try {
    return localStorage.getItem(SEEN_KEY);
  } catch {
    return null;
  }
}

/** ¿Hay que enseñar el cierre del mes pasado al entrar? Solo una vez por mes y si hubo gastos. */
export function pendingClose(props: ViewProps): string | null {
  const previous = addMonths(monthOf(today()), -1);
  if (readSeen() === previous) return null;
  return props.data.expenses.some((e) => monthOf(e.spent_on) === previous) ? previous : null;
}

export function markCloseSeen(month: string) {
  try {
    localStorage.setItem(SEEN_KEY, month);
  } catch {
    // Sin almacenamiento: volverá a salir la próxima vez, no pasa nada.
  }
}

/** Resumen de un mes: gasto frente a presupuesto, categorías, quién pagó y saldo pendiente. */
export function MonthCloseSheet({ data, me, month, onClose }: ViewProps & { month: string; onClose: () => void }) {
  const c = monthClose(data, me, month);
  const partner = partnerOf(data.members, me);
  const delta = c.spentCents - c.previousSpentCents;
  const [showAll, setShowAll] = useState(false);
  const categories = showAll ? c.categories : c.categories.slice(0, 5);

  function settle() {
    onClose();
    location.hash = '#saldo';
  }

  return (
    <Sheet title={`Resumen de ${formatMonth(month).toLowerCase()}`} onClose={onClose}>
      <div className="stack">
        <div className="close-stats">
          <div>
            <span className="muted small">Gastado</span>
            <strong>{formatEuros(c.spentCents)}</strong>
            {c.previousSpentCents > 0 && (
              <span className={'small ' + (delta > 0 ? 'delta-up' : 'delta-down')}>
                {delta > 0 ? '▲' : '▼'} {formatEuros(Math.abs(delta))} que el mes anterior
              </span>
            )}
          </div>
          <div>
            <span className="muted small">Presupuesto</span>
            <strong>{c.budgetCents ? formatEuros(c.budgetCents) : '—'}</strong>
            {c.budgetCents > 0 && (
              <span className={'small ' + (c.spentCents > c.budgetCents ? 'delta-up' : 'delta-down')}>
                {c.spentCents > c.budgetCents
                  ? `Os pasasteis ${formatEuros(c.spentCents - c.budgetCents)}`
                  : `Sobraron ${formatEuros(c.budgetCents - c.spentCents)}`}
              </span>
            )}
          </div>
        </div>

        {c.overBudget.length > 0 && (
          <p className="notice small">🚨 Se pasaron del presupuesto: {c.overBudget.map((o) => `${o.name} (+${formatEuros(o.overCents)})`).join(', ')}.</p>
        )}

        {categories.length > 0 && (
          <div>
            <h3>Por categoría</h3>
            <ul className="list">
              {categories.map((cat) => {
                const d = cat.cents - cat.previousCents;
                return (
                  <li key={cat.categoryId} className="list-item static">
                    <span className="grow">{cat.name}</span>
                    <span className="amounts">
                      <span className="title">{formatEuros(cat.cents)}</span>
                      {cat.previousCents > 0 && Math.abs(d) >= 100 && (
                        <span className={'small ' + (d > 0 ? 'delta-up' : 'delta-down')}> {d > 0 ? '▲' : '▼'} {formatEuros(Math.abs(d))}</span>
                      )}
                    </span>
                  </li>
                );
              })}
            </ul>
            {c.categories.length > 5 && !showAll && (
              <button className="link small" onClick={() => setShowAll(true)}>Ver todas</button>
            )}
          </div>
        )}

        {partner && c.paidBy.length > 0 && (
          <p className="small">
            Pagasteis: {c.paidBy.map((p) => `${nameOf(data.members, p.userId, me)} ${formatEuros(p.cents)}`).join(' · ')}.
          </p>
        )}

        {partner && c.balanceCents !== 0 && (
          <div className="notice row">
            <span className="grow">
              {c.balanceCents > 0
                ? `Hoy ${partner.display_name} te debe ${formatEuros(c.balanceCents)}.`
                : `Hoy debes ${formatEuros(-c.balanceCents)} a ${partner.display_name}.`}
            </span>
            <button className="secondary chip-btn" onClick={settle}>Anotar reembolso</button>
          </div>
        )}

        <button className="primary" onClick={onClose}>Cerrar</button>
      </div>
    </Sheet>
  );
}
