import { useState } from 'react';
import { addMonths, formatMonth, monthOf, today } from '../lib/dates';
import { formatEuros } from '../lib/money';
import { monthClose } from '../lib/monthClose';
import { nameOf, partnerOf } from '../lib/people';
import { Avatar, CategoryIcon, Notice, SectionHeader, Sheet, type ViewProps } from './common';
import { Icon } from './icons';

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
    <Sheet
      title={`Resumen de ${formatMonth(month).toLowerCase()}`}
      subtitle="Así fue el mes en pocas cifras."
      onClose={onClose}
      footer={<button className="primary lg block" onClick={onClose}>Cerrar</button>}
    >
      <div className="stack">
        <div className="stat-grid">
          <div className="stat-tile">
            <span className="stat-label">Gastado</span>
            <strong>{formatEuros(c.spentCents)}</strong>
            {c.previousSpentCents > 0 && delta !== 0 && (
              <span className="xsmall muted row" style={{ gap: 4 }}>
                <Icon name={delta > 0 ? 'arrowUp' : 'arrowDown'} size={13} />
                {formatEuros(Math.abs(delta))} {delta > 0 ? 'más' : 'menos'} que el mes anterior
              </span>
            )}
          </div>
          <div className="stat-tile">
            <span className="stat-label">Presupuesto</span>
            <strong>{c.budgetCents ? formatEuros(c.budgetCents) : 'Sin poner'}</strong>
            {c.budgetCents > 0 && (
              <span className={'xsmall ' + (c.spentCents > c.budgetCents ? 'negative' : 'positive')}>
                {c.spentCents > c.budgetCents
                  ? `Os pasasteis ${formatEuros(c.spentCents - c.budgetCents)}`
                  : `Sobraron ${formatEuros(c.budgetCents - c.spentCents)}`}
              </span>
            )}
          </div>
        </div>

        {c.overBudget.length > 0 && (
          <Notice kind="over">Se pasaron del presupuesto: {c.overBudget.map((o) => `${o.name} (+${formatEuros(o.overCents)})`).join(', ')}.</Notice>
        )}

        {categories.length > 0 && (
          <div className="section">
            <SectionHeader title="Por categoría" />
            <ul className="list with-icons">
              {categories.map((cat) => {
                const d = cat.cents - cat.previousCents;
                return (
                  <li key={cat.categoryId} className="row-item">
                    <CategoryIcon name={cat.name} />
                    <span className="row-main"><span className="row-title">{cat.name}</span></span>
                    <span className="row-end">
                      <span className="row-amount">{formatEuros(cat.cents)}</span>
                      {cat.previousCents > 0 && Math.abs(d) >= 100 && (
                        <span className="row-sub muted">{d > 0 ? '+' : '−'}{formatEuros(Math.abs(d))} que antes</span>
                      )}
                    </span>
                  </li>
                );
              })}
            </ul>
            {c.categories.length > 5 && !showAll && (
              <button className="link-btn small" onClick={() => setShowAll(true)}>Ver todas las categorías</button>
            )}
          </div>
        )}

        {partner && c.paidBy.length > 0 && (
          <div className="card" style={{ boxShadow: 'none', background: 'var(--surface-2)' }}>
            <h3 className="stat-label">Quién pagó</h3>
            <ul className="legend">
              {c.paidBy.map((p) => (
                <li key={p.userId}>
                  <Avatar members={data.members} userId={p.userId} size="sm" />
                  {nameOf(data.members, p.userId, me)}
                  <span className="money">{formatEuros(p.cents)}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {partner && c.balanceCents !== 0 && (
          <Notice icon="swap" action={<button className="sm tinted" onClick={settle}>Anotar reembolso</button>}>
            {c.balanceCents > 0
              ? `Hoy ${partner.display_name} te debe ${formatEuros(c.balanceCents)}.`
              : `Hoy debes ${formatEuros(-c.balanceCents)} a ${partner.display_name}.`}
          </Notice>
        )}
      </div>
    </Sheet>
  );
}
