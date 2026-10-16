import { useState } from 'react';
import { categoryStyle } from '../lib/categoryStyle';
import { formatMonth } from '../lib/dates';
import { formatEuros } from '../lib/money';
import { nameOf } from '../lib/people';
import { averageOfActive, breakdown, monthlyTotals, type MonthTotal, type Slice } from '../lib/stats';
import { CategoryIcon, EmptyState, MonthNav, personTone, SectionHeader, type ViewProps, useMonth } from './common';
import { Icon } from './icons';

export default function ChartsView({ data, me, onAdd }: ViewProps & { onAdd: () => void }) {
  const [month, setMonth] = useMonth();
  const [categoryId, setCategoryId] = useState('');
  const categoryName = new Map(data.categories.map((c) => [c.id, c.name]));
  const sortedCategories = [...data.categories].sort((a, b) => a.name.localeCompare(b.name, 'es'));

  const year = monthlyTotals(data.expenses, data.budgets, month, 12, categoryId, new Set(data.categories.filter((c) => c.archived).map((c) => c.id)));
  const byCategory = breakdown(data.expenses, month, (e) => e.category_id);
  const byPayer = breakdown(data.expenses, month, (e) => e.paid_by);
  const byKind = breakdown(data.expenses, month, (e) => (e.recurring_id ? 'fijo' : 'variable'));
  const monthTotal = byCategory.reduce((s, x) => s + x.cents, 0);
  const selected = year.find((t) => t.month === month);

  if (data.expenses.length === 0) {
    return (
      <div className="card">
        <EmptyState
          icon="chart"
          title="Aún no hay nada que mostrar"
          text="Cuando apuntéis gastos, aquí veréis cómo evoluciona el gasto mes a mes y en qué se va el dinero."
          action={<button className="primary" onClick={onAdd}><Icon name="plus" /> Añadir gasto</button>}
        />
      </div>
    );
  }

  return (
    <>
      <MonthNav month={month} onChange={setMonth} />

      <section className="section" aria-labelledby="charts-year">
        <SectionHeader id="charts-year" title="Últimos 12 meses" />
        <div className="card">
          <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)} aria-label="Categoría del gráfico">
            <option value="">Todas las categorías</option>
            {sortedCategories.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
          <MonthBars totals={year} selected={month} onSelect={setMonth} />
          {selected && (
            <p className="hbar-top" aria-live="polite">
              <span className="name">{formatMonth(month)}</span>
              <span className="value">
                {formatEuros(selected.spentCents)}
                {selected.budgetCents != null && <span className="muted"> de {formatEuros(selected.budgetCents)}</span>}
              </span>
            </p>
          )}
          <p className="muted small">
            Media de <strong>{formatEuros(averageOfActive(year))}</strong> al mes (meses con gastos).
            {year.some((t) => t.budgetCents) && ' La raya marca el presupuesto.'} Toca una barra para ver ese mes.
          </p>
        </div>
      </section>

      <section className="section" aria-labelledby="charts-categories">
        <SectionHeader id="charts-categories" title={`En qué se va · ${formatEuros(monthTotal)}`} />
        <div className="card">
          {byCategory.length === 0 ? (
            <p className="muted small">No hay gastos en {formatMonth(month).toLowerCase()}.</p>
          ) : (
            <ul className="hbars">
              {byCategory.map((s) => {
                const name = categoryName.get(s.id) ?? 'Sin categoría';
                return (
                  <li key={s.id} className="hbar-row">
                    <CategoryIcon name={name} size="sm" />
                    <div className="hbar-body">
                      <div className="hbar-top">
                        <span className="name">{name}</span>
                        <span className="value">{formatEuros(s.cents)} <span className="muted">· {Math.round(s.share * 100)} %</span></span>
                      </div>
                      <div className="hbar" aria-hidden>
                        <div className={`fill-tone tone-${categoryStyle(name).tone}`} style={{ width: `${(s.cents / byCategory[0].cents) * 100}%` }} />
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </section>

      {monthTotal > 0 && (
        <section className="section" aria-labelledby="charts-split">
          <SectionHeader id="charts-split" title="Reparto del mes" />
          <div className="card">
            {data.members.length > 1 && (
              <>
                <h3 className="stat-label">Quién ha pagado</h3>
                <SplitBar slices={byPayer} label={(id) => nameOf(data.members, id, me)} fill={(id) => 'fill-person-' + personTone(data.members, id)} />
              </>
            )}
            <h3 className="stat-label">Fijos y del día a día</h3>
            <SplitBar slices={byKind} label={(id) => (id === 'fijo' ? 'Gastos fijos' : 'Del día a día')} fill={(id) => (id === 'fijo' ? 'fill-fixed' : 'fill-variable')} />
          </div>
        </section>
      )}
    </>
  );
}

/** Barras verticales por mes, con raya de presupuesto si lo hay. */
function MonthBars({ totals, selected, onSelect }: { totals: MonthTotal[]; selected: string; onSelect: (m: string) => void }) {
  const max = Math.max(1, ...totals.map((t) => Math.max(t.spentCents, t.budgetCents ?? 0)));
  const W = 320;
  const H = 160;
  const top = 20;
  const bottom = 20;
  const slot = W / totals.length;
  const y = (cents: number) => top + (H - top - bottom) * (1 - cents / max);
  const initial = (m: string) =>
    new Date(Number(m.slice(0, 4)), Number(m.slice(5, 7)) - 1, 1).toLocaleDateString('es-ES', { month: 'narrow' });

  return (
    <svg className="month-bars" viewBox={`0 0 ${W} ${H}`} role="group" aria-label="Gasto de cada mes">
      <line className="grid" x1={0} x2={W} y1={H - bottom + 0.5} y2={H - bottom + 0.5} />
      {totals.map((t, i) => {
        const x = i * slot + slot * 0.2;
        const w = slot * 0.6;
        const over = t.budgetCents != null && t.budgetedSpentCents > t.budgetCents;
        const isSelected = t.month === selected;
        const label = `${formatMonth(t.month)}: ${formatEuros(t.spentCents)}${t.budgetCents ? ` de ${formatEuros(t.budgetCents)}` : ''}`;
        return (
          <g
            key={t.month}
            onClick={() => onSelect(t.month)}
            onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), onSelect(t.month))}
            className={'bar' + (isSelected ? ' selected' : '') + (over ? ' over' : '')}
            role="button"
            tabIndex={0}
            aria-label={label}
            aria-pressed={isSelected}
          >
            <title>{label}</title>
            <rect x={i * slot} y={0} width={slot} height={H} fill="transparent" />
            <rect className="bar-fill" x={x} y={y(t.spentCents)} width={w} height={Math.max(0, H - bottom - y(t.spentCents))} rx={4} />
            {t.budgetCents != null && <line className="budget-mark" x1={x - 2} x2={x + w + 2} y1={y(t.budgetCents)} y2={y(t.budgetCents)} />}
            <text className="axis" x={x + w / 2} y={H - 5} textAnchor="middle">{initial(t.month).toUpperCase()}</text>
          </g>
        );
      })}
    </svg>
  );
}

/** Una barra partida en trozos (por persona, por tipo…) con su leyenda. */
function SplitBar({ slices, label, fill }: { slices: Slice[]; label: (id: string) => string; fill: (id: string) => string }) {
  return (
    <div className="stack-sm">
      <div className="split-track" aria-hidden>
        {slices.map((s) => (
          <div key={s.id} className={fill(s.id)} style={{ width: `${s.share * 100}%` }} />
        ))}
      </div>
      <ul className="legend">
        {slices.map((s) => (
          <li key={s.id}>
            <span className={'dot ' + fill(s.id)} />
            {label(s.id)} <span className="muted">· {Math.round(s.share * 100)} %</span>
            <span className="money">{formatEuros(s.cents)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
