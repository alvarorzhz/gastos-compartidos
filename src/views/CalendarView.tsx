import { useMemo, useState } from 'react';
import { calendarStats, dayTotals, heatLevel, monthGrid, shortEuros, upcomingFixed } from '../lib/calendar';
import { formatDayHeading, formatShortDay, monthOf, today } from '../lib/dates';
import { formatEuros } from '../lib/money';
import type { Expense } from '../lib/types';
import { CategoryIcon, MonthNav, type ViewProps, useMonth } from './common';
import { ExpenseRow } from './ExpenseRow';
import { ExpenseForm } from './lazy';

const WEEKDAYS = [
  ['L', 'lunes'], ['M', 'martes'], ['X', 'miércoles'], ['J', 'jueves'], ['V', 'viernes'], ['S', 'sábado'], ['D', 'domingo'],
];

/** Gastos → Calendario: el mes día a día, con más color cuanto más se gastó, y los fijos que vienen. */
export default function CalendarView(props: ViewProps) {
  const { data, me } = props;
  const [month, setMonth] = useMonth();
  const [picked, setPicked] = useState<string | null>(null);
  const [editing, setEditing] = useState<Expense | null>(null);
  const todayIso = today();
  const isCurrent = month === monthOf(todayIso);

  const totals = useMemo(() => dayTotals(data.expenses, month), [data.expenses, month]);
  const fixed = useMemo(() => upcomingFixed(data.recurring, month, todayIso), [data.recurring, month, todayIso]);
  const stats = calendarStats(totals, month, todayIso);
  const max = Math.max(0, ...[...totals.values()].map((t) => t.cents));
  const weeks = monthGrid(month);
  // Día abierto: el que se tocó; si no, hoy (en el mes actual) o el día que más se gastó.
  const day = picked && monthOf(picked) === month ? picked : isCurrent ? todayIso : stats.busiest?.date ?? null;
  const dayExpenses = day ? data.expenses.filter((e) => e.spent_on === day) : [];
  const dayFixed = day ? fixed.get(day) ?? [] : [];
  const dayTotal = day ? totals.get(day)?.cents ?? 0 : 0;
  const categoryName = (id: string) => data.categories.find((c) => c.id === id)?.name ?? 'Otros';

  return (
    <>
      <MonthNav month={month} onChange={(m) => { setMonth(m); setPicked(null); }} />

      <section className="card calendar" aria-label="Calendario de gastos">
        <div className="cal-week cal-weekdays" aria-hidden>
          {WEEKDAYS.map(([short, long]) => <span key={long}>{short}</span>)}
        </div>
        <div className="cal-days">
          {weeks.map((week) => (
            <div key={week[0]} className="cal-week">
              {week.map((d) => {
                if (monthOf(d) !== month) return <span key={d} className="cal-day cal-out" aria-hidden />;
                const t = totals.get(d);
                const f = fixed.get(d);
                const level = heatLevel(t?.cents ?? 0, max);
                const label = `${formatDayHeading(d, todayIso)}: ${t ? `${formatEuros(t.cents)} en ${t.count} ${t.count === 1 ? 'gasto' : 'gastos'}` : 'sin gastos'}${f ? `, ${f.length === 1 ? 'un fijo previsto' : `${f.length} fijos previstos`}` : ''}`;
                return (
                  <button
                    key={d}
                    type="button"
                    className={'cal-day cal-level-' + level + (d === todayIso ? ' cal-today' : '') + (d > todayIso ? ' cal-future' : '')}
                    aria-pressed={d === day}
                    aria-label={label}
                    onClick={() => setPicked(d)}
                  >
                    <span className="cal-num">{Number(d.slice(8))}</span>
                    <span className="cal-amount">{t ? shortEuros(t.cents) : ''}</span>
                    {f && <span className="cal-fixed" aria-hidden />}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
        <div className="cal-legend" aria-hidden>
          <span>Menos</span>
          {[1, 2, 3, 4].map((l) => <span key={l} className={'cal-swatch cal-level-' + l} />)}
          <span>Más</span>
          {fixed.size > 0 && <span className="cal-legend-fixed"><span className="cal-fixed" /> Fijo previsto</span>}
        </div>
      </section>

      <div className="stat-grid three">
        <div className="stat-tile">
          <span className="stat-label">Por día</span>
          <strong>{formatEuros(stats.perDayCents)}</strong>
        </div>
        <div className="stat-tile">
          <span className="stat-label">Sin gastar</span>
          <strong>{stats.quietDays} {stats.quietDays === 1 ? 'día' : 'días'}</strong>
        </div>
        <div className="stat-tile">
          <span className="stat-label">El que más</span>
          <strong>{stats.busiest ? formatShortDay(stats.busiest.date, todayIso) : '—'}</strong>
        </div>
      </div>

      {day && (
        <section className="section" aria-labelledby="cal-day-title">
          <div className="section-header">
            <h2 id="cal-day-title">{formatDayHeading(day, todayIso)}</h2>
            {dayTotal > 0 && <strong className="money">{formatEuros(dayTotal)}</strong>}
          </div>
          {dayExpenses.length === 0 && dayFixed.length === 0 ? (
            <p className="card muted small cal-empty">{day > todayIso ? 'Nada previsto para ese día.' : 'Ese día no gastasteis nada 🌿'}</p>
          ) : (
            <ul className="list with-icons">
              {dayExpenses.map((e) => <ExpenseRow key={e.id} expense={e} data={data} me={me} onOpen={setEditing} />)}
              {dayFixed.map((f) => (
                <li key={f.id}>
                  <div className="row-item cal-fixed-row">
                    <CategoryIcon name={categoryName(f.categoryId)} />
                    <div className="row-main">
                      <span className="row-title">{f.note || categoryName(f.categoryId)}</span>
                      <span className="row-meta">Fijo previsto · se apuntará solo</span>
                    </div>
                    <div className="row-end">
                      <span className="row-amount">{formatEuros(f.cents)}</span>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {editing && <ExpenseForm {...props} expense={editing} onClose={() => setEditing(null)} />}
    </>
  );
}
