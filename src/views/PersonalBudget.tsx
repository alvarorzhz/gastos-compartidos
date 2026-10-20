import { useId, useState } from 'react';
import { categoryStyle } from '../lib/categoryStyle';
import { formatMonth, monthOf, today } from '../lib/dates';
import { centsToInput, formatEuros, parseEuros } from '../lib/money';
import { categoryOptions } from '../lib/personal';
import { budgetAlerts, budgetRows, monthlyFlows, suggestedLimit, trend, type MonthFlow, type Trend } from '../lib/personalBudget';
import { errorMessage, supabase } from '../lib/supabase';
import { CategoryIcon, EmptyState, Notice, Progress, SectionHeader, Sheet, toast, type ViewProps } from './common';
import { Icon } from './icons';

/** «En qué has gastado» con el límite de cada categoría y su aviso. */
export function PersonalBudgetSection(props: ViewProps & { month: string }) {
  const { data, month } = props;
  const [editing, setEditing] = useState(false);
  const rows = budgetRows(data.personal, data.personalBudgets, month);
  const alerts = month === monthOf(today()) ? budgetAlerts(rows) : [];
  const maxSpent = Math.max(1, ...rows.filter((r) => r.limitCents == null).map((r) => r.spentCents));
  const withLimit = rows.filter((r) => r.limitCents != null);
  const limitTotal = withLimit.reduce((s, r) => s + r.limitCents!, 0);
  const limitSpent = withLimit.reduce((s, r) => s + r.spentCents, 0);

  return (
    <>
      {alerts.map((a) => (
        <Notice key={a.category} kind={a.spentCents > a.limitCents! ? 'over' : 'warn'}>
          {a.spentCents > a.limitCents!
            ? <>Te has pasado en <strong>{a.category}</strong>: llevas {formatEuros(a.spentCents)} de {formatEuros(a.limitCents!)} este mes.</>
            : <>Cerca del límite en <strong>{a.category}</strong>: llevas {formatEuros(a.spentCents)} de {formatEuros(a.limitCents!)} ({Math.round((a.spentCents / a.limitCents!) * 100)} %).</>}
        </Notice>
      ))}
      <section className="section" aria-labelledby="personal-categories">
        <SectionHeader
          id="personal-categories"
          title="En qué has gastado"
          action={<button className="link-btn small" onClick={() => setEditing(true)}><Icon name="target" size={16} /> Límites</button>}
        />
        {rows.length === 0 ? (
          <div className="card">
            <EmptyState icon="target" title="Sin gastos este mes" text="Pon un límite al mes a tus categorías (el súper, comer fuera…) y te avisaré al acercarte." />
          </div>
        ) : (
          <div className="card">
            {withLimit.length > 0 && (
              <p className="muted small">
                Con límite: {formatEuros(limitSpent)} de {formatEuros(limitTotal)}
                {limitSpent <= limitTotal ? `, te quedan ${formatEuros(limitTotal - limitSpent)}.` : `, ${formatEuros(limitSpent - limitTotal)} por encima.`}
              </p>
            )}
            <ul className="hbars">
              {rows.map((r) => (
                <li key={r.category} className="hbar-row">
                  <CategoryIcon name={r.category} size="sm" />
                  <div className="hbar-body">
                    <div className="hbar-top">
                      <span className="name">{r.category}</span>
                      <span className="value">
                        {formatEuros(r.spentCents)}
                        {r.limitCents != null && <span className="muted"> de {formatEuros(r.limitCents)}</span>}
                      </span>
                    </div>
                    {r.limitCents != null ? (
                      <Progress value={r.spentCents} max={r.limitCents} label={`${r.category}: gastado del límite`} />
                    ) : (
                      <div className="hbar" aria-hidden>
                        <div className={`fill-tone tone-${categoryStyle(r.category).tone}`} style={{ width: `${(r.spentCents / maxSpent) * 100}%` }} />
                      </div>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>
      {editing && <LimitsSheet {...props} onClose={() => setEditing(false)} />}
    </>
  );
}

function LimitsSheet({ data, reload, month, onClose }: ViewProps & { month: string; onClose: () => void }) {
  const current = new Map(data.personalBudgets.map((b) => [b.category, b.amount_cents]));
  const names = [...new Set([...categoryOptions(data.personal, 'expense'), ...current.keys()])].filter((c) => c !== 'Otros' || current.has(c));
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(names.map((n) => [n, current.has(n) ? centsToInput(current.get(n)!) : ''])),
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const formId = useId();

  async function save() {
    const upserts: { category: string; amount_cents: number }[] = [];
    const removals: string[] = [];
    for (const name of names) {
      const raw = values[name].trim();
      if (!raw) {
        if (current.has(name)) removals.push(name);
        continue;
      }
      const cents = parseEuros(raw);
      if (cents == null) return setError(`El límite de ${name} no es un importe válido (por ejemplo 200 o 150,50).`);
      if (cents !== current.get(name)) upserts.push({ category: name, amount_cents: cents });
    }
    setBusy(true);
    setError(null);
    if (upserts.length) {
      const { error } = await supabase.from('personal_budgets').upsert(upserts.map((u) => ({ ...u, updated_at: new Date().toISOString() })), { onConflict: 'user_id,category' });
      if (error) {
        setBusy(false);
        return setError(errorMessage(error));
      }
    }
    if (removals.length) {
      const { error } = await supabase.from('personal_budgets').delete().in('category', removals);
      if (error) {
        setBusy(false);
        return setError(errorMessage(error));
      }
    }
    await reload();
    setBusy(false);
    toast('Límites guardados');
    onClose();
  }

  return (
    <Sheet
      title="Límites al mes"
      subtitle="Valen todos los meses hasta que los cambies. Déjalo vacío para no poner límite."
      onClose={onClose}
      footer={
        <>
          {error && <p className="error" role="alert">{error}</p>}
          <button type="button" className="primary lg" onClick={() => void save()} disabled={busy}>{busy ? 'Guardando…' : 'Guardar'}</button>
        </>
      }
    >
      <form id={formId} className="stack" onSubmit={(e) => { e.preventDefault(); void save(); }} noValidate>
        <ul className="list with-icons">
          {names.map((name) => {
            const hint = suggestedLimit(data.personal, name, month);
            return (
              <li key={name}>
                <label className="row-item">
                  <CategoryIcon name={name} />
                  <span className="row-main">
                    <span className="row-title">{name}</span>
                    {hint != null && !values[name] && (
                      <button type="button" className="link-btn small limit-hint" onClick={() => setValues({ ...values, [name]: centsToInput(hint) })}>
                        Media: {formatEuros(hint)} · Usar
                      </button>
                    )}
                  </span>
                  <span className="limit-input">
                    <input inputMode="decimal" placeholder="Sin límite" value={values[name]} onChange={(e) => setValues({ ...values, [name]: e.target.value })} aria-label={`Límite de ${name}`} />
                    <span aria-hidden>€</span>
                  </span>
                </label>
              </li>
            );
          })}
        </ul>
      </form>
    </Sheet>
  );
}

const PAST = 6;
const AHEAD = 3;

/** Gráfica de ingresos y gastos (o de una categoría frente a su límite) con su tendencia probable. */
export function PersonalTrends({ data }: ViewProps) {
  const [category, setCategory] = useState('');
  const thisMonth = monthOf(today());
  const flows = monthlyFlows(data.personal, thisMonth, PAST + 1, category);
  const complete = flows.slice(0, -1);
  const income = category ? null : trend(complete.map((f) => f.incomeCents), AHEAD);
  const expense = trend(complete.map((f) => f.expenseCents), AHEAD);
  const limit = category ? data.personalBudgets.find((b) => b.category === category)?.amount_cents ?? null : null;
  const categories = [...new Set(data.personal.filter((e) => e.kind === 'expense').map((e) => e.category))].sort((a, b) => a.localeCompare(b, 'es'));

  if (!data.personal.some((e) => monthOf(e.entry_on) >= flows[0].month)) return null;

  return (
    <section className="section" aria-labelledby="personal-trends">
      <SectionHeader id="personal-trends" title="Tendencia" />
      <div className="card">
        <select value={category} onChange={(e) => setCategory(e.target.value)} aria-label="Qué ver en la gráfica">
          <option value="">Ingresos y gastos</option>
          {categories.map((c) => <option key={c} value={c}>Gastos de {c}</option>)}
        </select>
        <TrendBars flows={flows} income={income} expense={expense} limit={limit} />
        <ul className="legend legend-row">
          {!category && <li><span className="dot fill-income" /> Ingresos</li>}
          <li><span className="dot fill-expense" /> Gastos</li>
          <li><span className="dot fill-forecast" /> Previsión</li>
          {limit != null && <li><span className="dash-mark" /> Tu límite</li>}
        </ul>
        <TrendText income={income} expense={expense} category={category} limit={limit} />
      </div>
    </section>
  );
}

function TrendText({ income, expense, category, limit }: { income: Trend | null; expense: Trend | null; category: string; limit: number | null }) {
  if (!expense && !income) {
    return <p className="muted small">Para calcular la tendencia hacen falta al menos 3 meses completos con movimientos.</p>;
  }
  const word = (t: Trend) => (t.direction === 'up' ? <>van <strong>subiendo</strong></> : t.direction === 'down' ? <>van <strong>bajando</strong></> : <>se mantienen <strong>estables</strong></>);
  const avg = (t: Trend) => Math.round(t.next.reduce((s, x) => s + x, 0) / t.next.length);
  return (
    <div className="stack-sm">
      {expense && (
        <p className="small">
          {category ? `Tus gastos de ${category}` : 'Tus gastos'} {word(expense)}. Si sigues así, unos <strong>{formatEuros(avg(expense))}</strong> al mes los próximos {AHEAD} meses
          {limit != null && (avg(expense) > limit ? `, por encima de tu límite de ${formatEuros(limit)}` : `, dentro de tu límite de ${formatEuros(limit)}`)}.
        </p>
      )}
      {income && (
        <p className="small">
          Tus ingresos {word(income)}: unos <strong>{formatEuros(avg(income))}</strong> al mes.
          {expense && <> Te quedarían unos <strong className={avg(income) - avg(expense) < 0 ? 'negative' : 'positive'}>{formatEuros(avg(income) - avg(expense))}</strong> al mes.</>}
        </p>
      )}
      <p className="muted small">Es una previsión con tus últimos {Math.max(expense?.months ?? 0, income?.months ?? 0)} meses completos, no un dato seguro.</p>
    </div>
  );
}

function TrendBars({ flows, income, expense, limit }: { flows: MonthFlow[]; income: Trend | null; expense: Trend | null; limit: number | null }) {
  const lastMonth = flows[flows.length - 1].month;
  const future = Array.from({ length: AHEAD }, (_, k) => {
    const [y, m] = lastMonth.split('-').map(Number);
    const d = new Date(y, m + k, 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
  });
  const showIncome = income != null || flows.some((f) => f.incomeCents > 0);
  const values = [
    ...flows.flatMap((f) => [f.expenseCents, showIncome ? f.incomeCents : 0]),
    ...(expense?.next ?? []),
    ...(income?.next ?? []),
    limit ?? 0,
  ];
  const max = Math.max(1, ...values);
  const W = 320;
  const H = 170;
  const top = 12;
  const bottom = 20;
  const slots = flows.length + AHEAD;
  const slot = W / slots;
  const y = (c: number) => top + (H - top - bottom) * (1 - c / max);
  const h = (c: number) => Math.max(0, H - bottom - y(c));
  const initial = (m: string) => new Date(Number(m.slice(0, 4)), Number(m.slice(5, 7)) - 1, 1).toLocaleDateString('es-ES', { month: 'narrow' }).toUpperCase();
  const pair = (i: number, inc: number | null, exp: number, kind: 'real' | 'forecast' | 'current', month: string) => {
    const x0 = i * slot + slot * 0.14;
    const w = showIncome ? slot * 0.34 : slot * 0.6;
    const label = `${formatMonth(month)}${kind === 'forecast' ? ' (previsión)' : kind === 'current' ? ' (en curso)' : ''}: gastos ${formatEuros(exp)}${inc != null && showIncome ? `, ingresos ${formatEuros(inc)}` : ''}`;
    return (
      <g key={month} className={'trend-col ' + kind}>
        <title>{label}</title>
        {showIncome && inc != null && <rect className="t-income" x={x0} y={y(inc)} width={w} height={h(inc)} rx={3} />}
        <rect className="t-expense" x={showIncome ? x0 + w + slot * 0.04 : x0} y={y(exp)} width={w} height={h(exp)} rx={3} />
        <text className="axis" x={i * slot + slot / 2} y={H - 5} textAnchor="middle">{initial(month)}</text>
      </g>
    );
  };
  return (
    <svg className="month-bars trend-bars" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Ingresos y gastos de cada mes, con la previsión de los próximos meses">
      <line className="grid" x1={0} x2={W} y1={H - bottom + 0.5} y2={H - bottom + 0.5} />
      <line className="now-mark" x1={flows.length * slot} x2={flows.length * slot} y1={top} y2={H - bottom} />
      {flows.map((f, i) => pair(i, f.incomeCents, f.expenseCents, i === flows.length - 1 ? 'current' : 'real', f.month))}
      {future.map((m, k) => (expense || income ? pair(flows.length + k, income?.next[k] ?? null, expense?.next[k] ?? 0, 'forecast', m) : null))}
      {limit != null && <line className="budget-mark" x1={0} x2={W} y1={y(limit)} y2={y(limit)} />}
    </svg>
  );
}
