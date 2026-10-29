import { useMemo, useState } from 'react';
import { formatDay, formatDayHeading, formatMonth, monthOf } from '../lib/dates';
import { formatEuros } from '../lib/money';
import { nameOf, partnerOf } from '../lib/people';
import { frequencyText, monthlyEquivalent, nextDate } from '../lib/recurring';
import { filterExpenses } from '../lib/search';
import type { Expense, RecurringExpense } from '../lib/types';
import { capitalize, CategoryIcon, EmptyState, MonthNav, Sheet, type ViewProps, useMonth, useSticky } from './common';
import { ExpenseForm } from './lazy';
import { ExpenseRow, paidText } from './ExpenseRow';
import { Icon } from './icons';
import ImportStatement from './ImportStatement';
import FixedSuggestions from './FixedSuggestions';
import { EventsSheet } from './EventsView';

type Editing = { kind: 'expense'; expense: Expense | null; fixed?: boolean } | { kind: 'template'; template: RecurringExpense };

export default function ExpensesView(props: ViewProps & { onAdd: () => void }) {
  const { data, me, onAdd } = props;
  const [month, setMonth] = useMonth();
  const [editing, setEditing] = useState<Editing | null>(null);
  const [showFixed, setShowFixed] = useState(false);
  const [importing, setImporting] = useState(false);
  const [showEvents, setShowEvents] = useState(false);
  // Lo que se busca se conserva al ir a otra pantalla y volver.
  const [text, setText] = useSticky('gastos.texto', '');
  const [categoryId, setCategoryId] = useSticky('gastos.categoria', '');
  const [payer, setPayer] = useSticky('gastos.pagador', '');
  const [allMonths, setAllMonths] = useSticky('gastos.todo', false);

  const categoryName = useMemo(() => new Map(data.categories.map((c) => [c.id, c.name])), [data.categories]);
  const partner = partnerOf(data.members, me);
  const filtering = text.trim() !== '' || categoryId !== '' || payer !== '';
  const inScope = allMonths ? data.expenses : data.expenses.filter((e) => monthOf(e.spent_on) === month);
  const shown = filterExpenses(inScope, { text, categoryId }, (id) => categoryName.get(id) ?? '', (id) => nameOf(data.members, id))
    .filter((e) => !payer || e.paid_by === payer);
  const shownTotal = shown.reduce((t, e) => t + e.amount_cents, 0);
  const sortedCategories = [...data.categories].sort((a, b) => a.name.localeCompare(b.name, 'es'));
  const groups = groupBy(shown, (e) => (allMonths ? monthOf(e.spent_on) : e.spent_on));
  const clearFilters = () => {
    setText('');
    setCategoryId('');
    setPayer('');
  };

  const closeForm = () => setEditing(null);

  return (
    <>
      <div className="filters">
        <div className="search-field">
          <Icon name="search" size={18} />
          <input
            type="search"
            placeholder="Buscar gastos o importes"
            value={text}
            onChange={(e) => setText(e.target.value)}
            aria-label="Buscar gastos"
            enterKeyHint="search"
          />
        </div>
        <div className="filter-row" role="group" aria-label="Filtros">
          <select className="select-pill" value={allMonths ? 'all' : 'month'} onChange={(e) => setAllMonths(e.target.value === 'all')} aria-label="Periodo">
            <option value="month">Por meses</option>
            <option value="all">Todo el historial</option>
          </select>
          <select className={'select-pill' + (categoryId ? ' active' : '')} value={categoryId} onChange={(e) => setCategoryId(e.target.value)} aria-label="Filtrar por categoría">
            <option value="">Todas las categorías</option>
            {sortedCategories.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
          {partner && (
            <select className={'select-pill' + (payer ? ' active' : '')} value={payer} onChange={(e) => setPayer(e.target.value)} aria-label="Filtrar por quién pagó">
              <option value="">Pagó cualquiera</option>
              {data.members.map((m) => (
                <option key={m.user_id} value={m.user_id}>{m.user_id === me ? 'Pagaste tú' : `Pagó ${m.display_name}`}</option>
              ))}
            </select>
          )}
        </div>
      </div>

      {!allMonths && <MonthNav month={month} onChange={setMonth} />}

      <div className="row wrap">
        <button className="pill" onClick={() => setShowFixed(true)}>
          <Icon name="repeat" size={16} /> Gastos fijos {data.recurring.length > 0 && <span className="count">{data.recurring.length}</span>}
        </button>
        <button className="pill" onClick={() => setShowEvents(true)}>
          <Icon name="suitcase" size={16} /> Viajes{data.events.some((e) => !e.archived) && <span className="count">{data.events.filter((e) => !e.archived).length}</span>}
        </button>
        <button className="pill" onClick={() => setImporting(true)}>
          <Icon name="fileIn" size={16} /> Importar extracto
        </button>
      </div>

      {shown.length > 0 && (
        <div className="summary-line" aria-live="polite">
          <span>{filtering ? 'Total de lo encontrado' : allMonths ? 'Total del historial' : 'Total del mes'}</span>
          <span><strong>{formatEuros(shownTotal)}</strong> · {shown.length} {shown.length === 1 ? 'gasto' : 'gastos'}</span>
        </div>
      )}

      {shown.length === 0 ? (
        <div className="card">
          {filtering ? (
            <EmptyState
              icon="search"
              title="Ningún gasto coincide"
              text="Prueba con otra palabra o quita los filtros."
              action={<button className="secondary" onClick={clearFilters}>Quitar filtros</button>}
            />
          ) : (
            <EmptyState
              icon="receipt"
              title="Todavía no hay gastos"
              text={allMonths ? 'Cuando apuntéis el primer gasto aparecerá aquí.' : 'Aún no habéis añadido movimientos este mes.'}
              action={<button className="primary" onClick={onAdd}><Icon name="plus" /> Añadir gasto</button>}
            />
          )}
        </div>
      ) : (
        groups.map(([key, items]) => (
          <section key={key} className="day-group" aria-label={allMonths ? formatMonth(key) : formatDayHeading(key)}>
            <div className="day-head">
              <span>{allMonths ? formatMonth(key) : formatDayHeading(key)}</span>
              <span className="money">{formatEuros(items.reduce((t, e) => t + e.amount_cents, 0))}</span>
            </div>
            <ul className="list with-icons">
              {items.map((e) => (
                <ExpenseRow key={e.id} expense={e} data={data} me={me} showDate={allMonths} onOpen={(x) => setEditing({ kind: 'expense', expense: x })} />
              ))}
            </ul>
          </section>
        ))
      )}

      {showFixed && !editing && (
        <FixedExpenses
          {...props}
          onEdit={(template) => setEditing({ kind: 'template', template })}
          onNew={() => setEditing({ kind: 'expense', expense: null, fixed: true })}
          onClose={() => setShowFixed(false)}
        />
      )}

      {showEvents && <EventsSheet {...props} onClose={() => setShowEvents(false)} />}

      {importing && <ImportStatement {...props} onClose={() => setImporting(false)} />}

      {editing?.kind === 'expense' && <ExpenseForm {...props} expense={editing.expense} startAsFixed={editing.fixed} onClose={closeForm} />}
      {editing?.kind === 'template' && (
        <ExpenseForm {...props} expense={null} template={editing.template} onClose={closeForm} />
      )}
    </>
  );
}

/** Agrupa conservando el orden (los gastos ya vienen del más reciente al más antiguo). */
function groupBy<T>(items: T[], key: (x: T) => string): [string, T[]][] {
  const map = new Map<string, T[]>();
  for (const x of items) {
    const k = key(x);
    if (!map.has(k)) map.set(k, []);
    map.get(k)!.push(x);
  }
  return [...map.entries()];
}

function FixedExpenses({ data, me, reload, onEdit, onNew, onClose }: ViewProps & {
  onEdit: (t: RecurringExpense) => void;
  onNew: () => void;
  onClose: () => void;
}) {
  const categoryName = new Map(data.categories.map((c) => [c.id, c.name]));
  const active = data.recurring.filter((r) => r.active);
  const perMonth = active.reduce((s, r) => s + monthlyEquivalent(r), 0);
  const sorted = [...data.recurring].sort((a, b) => Number(b.active) - Number(a.active) || nextDate(a).localeCompare(nextDate(b)));

  return (
    <Sheet
      title="Gastos fijos"
      subtitle="Se apuntan solos en su fecha, cada mañana."
      onClose={onClose}
      footer={<button className="primary lg block" onClick={onNew}><Icon name="plus" /> Nuevo gasto fijo</button>}
    >
      <FixedSuggestions data={data} me={me} reload={reload} />
      {data.recurring.length === 0 ? (
        <EmptyState icon="repeat" title="Todavía no hay gastos fijos" text="Por ejemplo: alquiler, luz, internet o el gimnasio. También puedes crearlos al añadir un gasto, eligiendo cada cuánto se repite." />
      ) : (
        <div className="stack">
          <div className="stat-tile">
            <span className="stat-label">Al mes, en gastos fijos activos</span>
            <strong>Unos {formatEuros(perMonth)}</strong>
          </div>
          <ul className="list with-icons">
            {sorted.map((r) => {
              const category = categoryName.get(r.category_id) ?? 'Sin categoría';
              return (
                <li key={r.id}>
                  <button className={'row-item' + (r.active ? '' : ' paused')} onClick={() => onEdit(r)}>
                    <CategoryIcon name={category} />
                    <span className="row-main">
                      <span className="row-title">{r.note || category}</span>
                      <span className="row-meta">
                        {r.active ? `${capitalize(frequencyText(r.frequency))} · próximo ${formatDay(nextDate(r))}` : 'En pausa'} · {paidText(data.members, r.paid_by, me).replace('Pagaste', 'Pagas').replace('Pagó', 'Paga')}
                      </span>
                    </span>
                    <span className="row-end"><span className="row-amount">{formatEuros(r.amount_cents)}</span></span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </Sheet>
  );
}
