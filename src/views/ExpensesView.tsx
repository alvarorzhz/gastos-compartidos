import { useMemo, useState } from 'react';
import { alertText, budgetAlerts } from '../lib/alerts';
import { balanceFor, expenseEffect } from '../lib/balance';
import { formatDay, monthOf, today } from '../lib/dates';
import { formatEuros } from '../lib/money';
import { nameOf, partnerOf } from '../lib/people';
import { frequencyText, monthlyEquivalent, nextDate } from '../lib/recurring';
import { filterExpenses } from '../lib/search';
import type { Expense, RecurringExpense } from '../lib/types';
import { MonthNav, Sheet, type ViewProps } from './common';
import ExpenseForm from './ExpenseForm';

type Editing = { kind: 'expense'; expense: Expense | null; fixed?: boolean } | { kind: 'template'; template: RecurringExpense };

export default function ExpensesView(props: ViewProps) {
  const { data, me } = props;
  const [month, setMonth] = useState(monthOf(today()));
  const [editing, setEditing] = useState<Editing | null>(null);
  const [showFixed, setShowFixed] = useState(false);
  const [text, setText] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [allMonths, setAllMonths] = useState(false);

  const categoryName = useMemo(() => new Map(data.categories.map((c) => [c.id, c.name])), [data.categories]);
  const filtering = text.trim() !== '' || categoryId !== '';
  const inScope = allMonths ? data.expenses : data.expenses.filter((e) => monthOf(e.spent_on) === month);
  const shown = filterExpenses(inScope, { text, categoryId }, (id) => categoryName.get(id) ?? '', (id) => nameOf(data.members, id));
  const shownTotal = shown.reduce((t, e) => t + e.amount_cents, 0);
  const balance = balanceFor(me, data.expenses, data.settlements);
  const partner = partnerOf(data.members, me);
  const alerts = budgetAlerts(monthOf(today()), data.categories, data.expenses, data.budgets);
  const sortedCategories = [...data.categories].sort((a, b) => a.name.localeCompare(b.name, 'es'));

  const closeForm = () => setEditing(null);

  return (
    <>
      {!partner && (
        <div className="notice">Aún estás sola/o en este espacio. Invita a tu pareja desde Ajustes.</div>
      )}
      {partner && (
        <a className="balance-chip" href="#saldo">
          <BalanceText balance={balance} partnerName={partner.display_name} /> <span className="muted">›</span>
        </a>
      )}
      {alerts.length > 0 && (
        <ul className="alerts" aria-label="Avisos de presupuesto de este mes">
          {alerts.map((a) => (
            <li key={a.category.id} className={a.spentCents > a.budgetCents ? 'over' : 'near'}>{alertText(a)}</li>
          ))}
        </ul>
      )}

      <div className="filters">
        <input
          type="search"
          placeholder="🔍 Buscar (nota, categoría, quién pagó, importe)"
          value={text}
          onChange={(e) => setText(e.target.value)}
          aria-label="Buscar gastos"
        />
        <div className="row">
          <select className="grow" value={categoryId} onChange={(e) => setCategoryId(e.target.value)} aria-label="Filtrar por categoría">
            <option value="">Todas las categorías</option>
            {sortedCategories.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
          <fieldset className="segmented compact">
            <legend className="sr-only">Periodo</legend>
            <label className={!allMonths ? 'selected' : ''}>
              <input type="radio" name="scope" checked={!allMonths} onChange={() => setAllMonths(false)} />
              Mes
            </label>
            <label className={allMonths ? 'selected' : ''}>
              <input type="radio" name="scope" checked={allMonths} onChange={() => setAllMonths(true)} />
              Todo
            </label>
          </fieldset>
        </div>
      </div>

      {!allMonths && <MonthNav month={month} onChange={setMonth} />}
      <div className="row spread list-head">
        <span className="muted">
          {filtering ? `${shown.length} ${shown.length === 1 ? 'gasto' : 'gastos'}: ` : allMonths ? 'Total: ' : 'Total del mes: '}
          <strong>{formatEuros(shownTotal)}</strong>
        </span>
        <button className="link small" onClick={() => setShowFixed(true)}>🔁 Gastos fijos ({data.recurring.length})</button>
      </div>

      {shown.length === 0 ? (
        <p className="empty">{filtering ? 'Ningún gasto coincide con la búsqueda.' : allMonths ? 'Todavía no hay gastos.' : 'No hay gastos este mes.'}</p>
      ) : (
        <ul className="list">
          {shown.map((e) => {
            const effect = expenseEffect(me, e);
            return (
              <li key={e.id}>
                <button className="list-item" onClick={() => setEditing({ kind: 'expense', expense: e })}>
                  <div className="grow">
                    <div className="title">
                      {e.recurring_id && <span aria-label="Gasto fijo">🔁 </span>}
                      {e.note || categoryName.get(e.category_id)}
                      {e.owed_cents != null && <span className="split-tag">{splitLabel(e, me, partner?.display_name ?? '')}</span>}
                    </div>
                    <div className="muted small">
                      {allMonths ? formatDay(e.spent_on) + ' ' + e.spent_on.slice(0, 4) : formatDay(e.spent_on)} · {categoryName.get(e.category_id)} · pagó {e.paid_by === me ? 'tú' : nameOf(data.members, e.paid_by)}
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

      <button className="fab" onClick={() => setEditing({ kind: 'expense', expense: null })} aria-label="Añadir gasto">＋ Gasto</button>

      {showFixed && !editing && (
        <FixedExpenses
          {...props}
          onEdit={(template) => setEditing({ kind: 'template', template })}
          onNew={() => setEditing({ kind: 'expense', expense: null, fixed: true })}
          onClose={() => setShowFixed(false)}
        />
      )}

      {editing?.kind === 'expense' && <ExpenseForm {...props} expense={editing.expense} startAsFixed={editing.fixed} onClose={closeForm} />}
      {editing?.kind === 'template' && (
        <ExpenseForm {...props} expense={null} template={editing.template} onClose={closeForm} />
      )}
    </>
  );
}

function FixedExpenses({ data, me, onEdit, onNew, onClose }: ViewProps & {
  onEdit: (t: RecurringExpense) => void;
  onNew: () => void;
  onClose: () => void;
}) {
  const categoryName = new Map(data.categories.map((c) => [c.id, c.name]));
  const active = data.recurring.filter((r) => r.active);
  const perMonth = active.reduce((s, r) => s + monthlyEquivalent(r), 0);
  const sorted = [...data.recurring].sort((a, b) => Number(b.active) - Number(a.active) || nextDate(a).localeCompare(nextDate(b)));

  return (
    <Sheet title="Gastos fijos" onClose={onClose}>
      <div className="stack">
        <p className="muted small">
          Se apuntan solos en su fecha (al abrir la app). Para crear uno, añade un gasto y elige cada cuánto se repite.
        </p>
        {data.recurring.length === 0 ? (
          <p className="empty">Todavía no hay gastos fijos. Por ejemplo: alquiler, luz, internet o el gimnasio.</p>
        ) : (
          <>
            <p>Unos <strong>{formatEuros(perMonth)}</strong> al mes en gastos fijos activos.</p>
            <ul className="list">
              {sorted.map((r) => (
                <li key={r.id}>
                  <button className={'list-item' + (r.active ? '' : ' paused')} onClick={() => onEdit(r)}>
                    <div className="grow">
                      <div className="title">{r.note || categoryName.get(r.category_id)}</div>
                      <div className="muted small">
                        {r.active ? `${capitalize(frequencyText(r.frequency))} · próximo ${formatDay(nextDate(r))}` : 'En pausa'} · paga{' '}
                        {r.paid_by === me ? 'tú' : nameOf(data.members, r.paid_by)}
                      </div>
                    </div>
                    <div className="amounts title">{formatEuros(r.amount_cents)}</div>
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
        <button className="primary" onClick={onNew}>＋ Nuevo gasto fijo</button>
      </div>
    </Sheet>
  );
}

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** Etiqueta del reparto personalizado desde el punto de vista de quien mira. */
function splitLabel(e: Expense, me: string, partnerName: string): string {
  const owed = e.owed_cents ?? e.amount_cents / 2;
  const mine = e.paid_by === me ? e.amount_cents - owed : owed;
  const p = Math.round((mine * 100) / e.amount_cents);
  if (mine === e.amount_cents) return 'solo tuyo';
  if (mine === 0) return `solo de ${partnerName}`;
  return `tú ${p} %`;
}

export function BalanceText({ balance, partnerName }: { balance: number; partnerName: string }) {
  const rounded = Math.round(balance);
  if (rounded === 0) return <span>Estáis en paz ✨</span>;
  if (rounded > 0) {
    return <span>{partnerName} te debe <strong className="positive">{formatEuros(rounded)}</strong></span>;
  }
  return <span>Debes a {partnerName} <strong className="negative">{formatEuros(-rounded)}</strong></span>;
}
