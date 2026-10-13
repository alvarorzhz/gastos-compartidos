import { useState } from 'react';
import { monthOf, today } from '../lib/dates';
import { formatEuros } from '../lib/money';
import { nameOf } from '../lib/people';
import { averageOfActive, breakdown, monthlyTotals, type MonthTotal, type Slice } from '../lib/stats';
import { MonthNav, type ViewProps } from './common';

export default function ChartsView({ data, me }: ViewProps) {
  const [month, setMonth] = useState(monthOf(today()));
  const [categoryId, setCategoryId] = useState('');
  const categoryName = new Map(data.categories.map((c) => [c.id, c.name]));
  const sortedCategories = [...data.categories].sort((a, b) => a.name.localeCompare(b.name, 'es'));

  const year = monthlyTotals(data.expenses, data.budgets, month, 12, categoryId);
  const byCategory = breakdown(data.expenses, month, (e) => e.category_id);
  const byPayer = breakdown(data.expenses, month, (e) => e.paid_by);
  const byKind = breakdown(data.expenses, month, (e) => (e.recurring_id ? 'fijo' : 'variable'));
  const monthTotal = byCategory.reduce((s, x) => s + x.cents, 0);

  if (data.expenses.length === 0) {
    return <p className="empty">Cuando apuntéis gastos, aquí veréis gráficos de en qué se va el dinero.</p>;
  }

  return (
    <>
      <MonthNav month={month} onChange={setMonth} />

      <section className="card">
        <div className="row spread">
          <h3>Últimos 12 meses</h3>
        </div>
        <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)} aria-label="Categoría del gráfico">
          <option value="">Todas las categorías</option>
          {sortedCategories.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
        <MonthBars totals={year} selected={month} onSelect={setMonth} />
        <p className="muted small">
          Media: <strong>{formatEuros(averageOfActive(year))}</strong> al mes (meses con gastos).
          {year.some((t) => t.budgetCents) && ' La raya marca el presupuesto.'} Toca una barra para ver ese mes.
        </p>
      </section>

      <section className="card">
        <h3>En qué se va · {formatEuros(monthTotal)}</h3>
        {byCategory.length === 0 ? (
          <p className="muted">No hay gastos este mes.</p>
        ) : (
          <ul className="hbars">
            {byCategory.map((s) => (
              <li key={s.id}>
                <div className="row spread small">
                  <span>{categoryName.get(s.id) ?? '—'}</span>
                  <span>
                    {formatEuros(s.cents)} <span className="muted">· {Math.round(s.share * 100)} %</span>
                  </span>
                </div>
                <div className="hbar"><div style={{ width: `${(s.cents / byCategory[0].cents) * 100}%` }} /></div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {monthTotal > 0 && (
        <section className="card">
          <h3>Quién ha pagado este mes</h3>
          <SplitBar slices={byPayer} label={(id) => nameOf(data.members, id, me)} />
          <h3>Fijos y del día a día</h3>
          <SplitBar slices={byKind} label={(id) => (id === 'fijo' ? '🔁 Fijos' : 'Del día a día')} />
        </section>
      )}
    </>
  );
}

/** Barras verticales por mes, con raya de presupuesto si lo hay. */
function MonthBars({ totals, selected, onSelect }: { totals: MonthTotal[]; selected: string; onSelect: (m: string) => void }) {
  const max = Math.max(1, ...totals.map((t) => Math.max(t.spentCents, t.budgetCents ?? 0)));
  const W = 320;
  const H = 150;
  const top = 18;
  const bottom = 20;
  const slot = W / totals.length;
  const y = (cents: number) => top + (H - top - bottom) * (1 - cents / max);
  const initial = (m: string) =>
    new Date(Number(m.slice(0, 4)), Number(m.slice(5, 7)) - 1, 1).toLocaleDateString('es-ES', { month: 'narrow' });

  return (
    <svg className="month-bars" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Gasto de cada mes">
      {totals.map((t, i) => {
        const x = i * slot + slot * 0.18;
        const w = slot * 0.64;
        const over = t.budgetCents != null && t.spentCents > t.budgetCents;
        const isSelected = t.month === selected;
        return (
          <g key={t.month} onClick={() => onSelect(t.month)} className={'bar' + (isSelected ? ' selected' : '') + (over ? ' over' : '')}>
            <title>{`${t.month.slice(0, 7)}: ${formatEuros(t.spentCents)}${t.budgetCents ? ` de ${formatEuros(t.budgetCents)}` : ''}`}</title>
            <rect x={i * slot} y={0} width={slot} height={H} fill="transparent" />
            <rect x={x} y={y(t.spentCents)} width={w} height={Math.max(0, H - bottom - y(t.spentCents))} rx={3} />
            {t.budgetCents != null && <line className="budget-mark" x1={x - 2} x2={x + w + 2} y1={y(t.budgetCents)} y2={y(t.budgetCents)} />}
            {isSelected && t.spentCents > 0 && (
              <text className="value" x={x + w / 2} y={y(t.spentCents) - 5} textAnchor="middle">
                {Math.round(t.spentCents / 100)} €
              </text>
            )}
            <text className="axis" x={x + w / 2} y={H - 5} textAnchor="middle">{initial(t.month).toUpperCase()}</text>
          </g>
        );
      })}
    </svg>
  );
}

/** Una barra partida en trozos (por persona, por tipo…) con su leyenda. */
function SplitBar({ slices, label }: { slices: Slice[]; label: (id: string) => string }) {
  return (
    <div className="split-bar">
      <div className="bar-track">
        {slices.map((s, i) => (
          <div key={s.id} className={'piece piece-' + (i % 3)} style={{ width: `${s.share * 100}%` }} />
        ))}
      </div>
      <ul className="legend">
        {slices.map((s, i) => (
          <li key={s.id}>
            <span className={'dot piece-' + (i % 3)} />
            {label(s.id)}: <strong>{formatEuros(s.cents)}</strong> <span className="muted">({Math.round(s.share * 100)} %)</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
