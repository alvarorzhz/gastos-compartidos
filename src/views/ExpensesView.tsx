import { useMemo, useState } from 'react';
import { balanceFor, expenseEffect } from '../lib/balance';
import { formatDay, monthOf, today } from '../lib/dates';
import { formatEuros } from '../lib/money';
import { nameOf, partnerOf } from '../lib/people';
import type { Expense } from '../lib/types';
import { MonthNav, type ViewProps } from './common';
import ExpenseForm from './ExpenseForm';

export default function ExpensesView(props: ViewProps) {
  const { data, me } = props;
  const [month, setMonth] = useState(monthOf(today()));
  const [editing, setEditing] = useState<Expense | null | 'new'>(null);

  const categoryName = useMemo(() => new Map(data.categories.map((c) => [c.id, c.name])), [data.categories]);
  const monthExpenses = data.expenses.filter((e) => monthOf(e.spent_on) === month);
  const monthTotal = monthExpenses.reduce((t, e) => t + e.amount_cents, 0);
  const balance = balanceFor(me, data.expenses, data.settlements);
  const partner = partnerOf(data.members, me);

  return (
    <>
      {!partner && (
        <div className="notice">Aún estás sola/o en este espacio. Invita a tu pareja desde Ajustes.</div>
      )}
      {partner && (
        <div className="balance-chip">
          <BalanceText balance={balance} partnerName={partner.display_name} />
        </div>
      )}

      <MonthNav month={month} onChange={setMonth} />
      <p className="muted center">Total del mes: <strong>{formatEuros(monthTotal)}</strong></p>

      {monthExpenses.length === 0 ? (
        <p className="empty">No hay gastos este mes.</p>
      ) : (
        <ul className="list">
          {monthExpenses.map((e) => {
            const effect = expenseEffect(me, e);
            return (
              <li key={e.id}>
                <button className="list-item" onClick={() => setEditing(e)}>
                  <div className="grow">
                    <div className="title">{e.note || categoryName.get(e.category_id)}</div>
                    <div className="muted small">
                      {formatDay(e.spent_on)} · {categoryName.get(e.category_id)} · pagó {e.paid_by === me ? 'tú' : nameOf(data.members, e.paid_by)}
                    </div>
                  </div>
                  <div className="amounts">
                    <div className="title">{formatEuros(e.amount_cents)}</div>
                    {partner && (
                      <div className={'small ' + (effect > 0 ? 'positive' : 'negative')}>
                        {effect > 0 ? 'te deben ' : 'debes '}
                        {formatEuros(Math.abs(effect))}
                      </div>
                    )}
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <button className="fab" onClick={() => setEditing('new')} aria-label="Añadir gasto">＋ Gasto</button>

      {editing && (
        <ExpenseForm {...props} expense={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />
      )}
    </>
  );
}

export function BalanceText({ balance, partnerName }: { balance: number; partnerName: string }) {
  const rounded = Math.round(balance);
  if (rounded === 0) return <span>Estáis en paz ✨</span>;
  if (rounded > 0) {
    return <span>{partnerName} te debe <strong className="positive">{formatEuros(rounded)}</strong></span>;
  }
  return <span>Debes a {partnerName} <strong className="negative">{formatEuros(-rounded)}</strong></span>;
}
