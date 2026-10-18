import { useState } from 'react';
import { alertText, budgetAlerts } from '../lib/alerts';
import { balanceFor } from '../lib/balance';
import { monthlySummary, totals } from '../lib/budget';
import { monthOf, today } from '../lib/dates';
import { formatEuros } from '../lib/money';
import { nameOf, partnerOf } from '../lib/people';
import { categoryStyle } from '../lib/categoryStyle';
import { breakdown } from '../lib/stats';
import { monthForecast, type Forecast } from '../lib/forecast';
import type { Expense } from '../lib/types';
import { BalanceText } from './BalanceView';
import { Avatar, CategoryIcon, EmptyState, MonthNav, Notice, personTone, Progress, SectionHeader, type ViewProps, useMonth } from './common';
import ExpenseForm from './ExpenseForm';
import FixedSuggestions from './FixedSuggestions';
import { ExpenseRow } from './ExpenseRow';
import { Icon } from './icons';

const go = (view: string) => () => {
  location.hash = '#' + view;
};

/** Pantalla de inicio: cuánto lleváis gastado, cuánto queda, en qué y los últimos gastos. */
export default function HomeView(props: ViewProps & { onAdd: () => void }) {
  const { data, me, onAdd } = props;
  const [month, setMonth] = useMonth();
  const [editing, setEditing] = useState<Expense | null>(null);
  const isCurrent = month === monthOf(today());

  const monthExpenses = data.expenses.filter((e) => monthOf(e.spent_on) === month);
  const rows = monthlySummary(month, data.categories, data.expenses, data.budgets);
  const sum = totals(rows);
  const partner = partnerOf(data.members, me);
  const balance = balanceFor(me, data.expenses, data.settlements);
  const alerts = isCurrent ? budgetAlerts(month, data.categories, data.expenses, data.budgets) : [];
  const topCategories = rows.filter((r) => r.spentCents > 0).slice(0, 4);
  const byPayer = breakdown(data.expenses, month, (e) => e.paid_by);
  const recent = monthExpenses.slice(0, 5);

  return (
    <>
      <MonthNav month={month} onChange={setMonth} />

      <div className="home-grid">
        <div className="home-col">
          <SpendCard
            spent={sum.spentCents}
            budgetedSpent={sum.budgetedSpentCents}
            budget={sum.budgetCents}
            count={monthExpenses.length}
            isCurrent={isCurrent}
            forecast={isCurrent ? monthForecast(today(), data.expenses, data.recurring) : null}
          />

          {alerts.length > 0 && (
            <div className="stack-sm o-2" aria-label="Avisos de presupuesto">
              {alerts.map((a) => (
                <Notice key={a.category.id} kind={a.spentCents > a.budgetCents ? 'over' : 'warn'}>{alertText(a)}</Notice>
              ))}
            </div>
          )}

          {isCurrent && <div className="o-3"><FixedSuggestions {...props} /></div>}

          <div className="o-3">
          {!partner ? (
            <Notice
              icon="users"
              action={<button className="sm tinted" onClick={go('ajustes')}>Invitar</button>}
            >
              Aún estás solo/a en este espacio. Invita a tu pareja desde Ajustes para compartir los gastos.
            </Notice>
          ) : (
            <button className="card card-link balance-card" onClick={go('saldo')}>
              <span className="avatar-pair">
                <Avatar members={data.members} userId={me} />
                <Avatar members={data.members} userId={partner.user_id} />
              </span>
              <span className="grow">
                <span className="stat-label">Saldo entre los dos</span>
                <br />
                <BalanceText balance={balance} partnerName={partner.display_name} />
              </span>
              <Icon name="chevronRight" className="row-chevron" />
            </button>
          )}
          </div>

          {partner && sum.spentCents > 0 && (
            <section className="card o-6" aria-labelledby="home-payers">
              <h2 id="home-payers" className="stat-label">Quién ha pagado {isCurrent ? 'este mes' : 'ese mes'}</h2>
              <div className="split-track" aria-hidden>
                {byPayer.map((s) => (
                  <div key={s.id} className={'fill-person-' + personTone(data.members, s.id)} style={{ width: `${s.share * 100}%` }} />
                ))}
              </div>
              <ul className="legend">
                {byPayer.map((s) => (
                  <li key={s.id}>
                    <span className={'dot fill-person-' + personTone(data.members, s.id)} />
                    {nameOf(data.members, s.id, me)} <span className="muted">· {Math.round(s.share * 100)} %</span>
                    <span className="money">{formatEuros(s.cents)}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>

        <div className="home-col">
          <section className="section o-4" aria-labelledby="home-recent">
            <SectionHeader
              id="home-recent"
              title="Últimos movimientos"
              action={monthExpenses.length > 0 && <button className="link-btn small" onClick={go('gastos')}>Ver todos</button>}
            />
            {recent.length === 0 ? (
              <div className="card">
                <EmptyState
                  icon="receipt"
                  title="Todavía no hay gastos"
                  text={isCurrent ? 'Aún no habéis añadido movimientos este mes. Apunta el primero en un momento.' : 'Ese mes no apuntasteis ningún gasto.'}
                  action={isCurrent && <button className="primary" onClick={onAdd}><Icon name="plus" /> Añadir gasto</button>}
                />
              </div>
            ) : (
              <ul className="list with-icons">
                {recent.map((e) => (
                  <ExpenseRow key={e.id} expense={e} data={data} me={me} onOpen={setEditing} showDate />
                ))}
              </ul>
            )}
          </section>

          {topCategories.length > 0 && (
            <section className="section o-5" aria-labelledby="home-categories">
              <SectionHeader
                id="home-categories"
                title="En qué se os va"
                action={<button className="link-btn small" onClick={go('presupuesto')}>Ver presupuesto</button>}
              />
              <div className="card">
                <ul className="hbars">
                  {topCategories.map((r) => (
                    <li key={r.category.id} className="hbar-row">
                      <CategoryIcon name={r.category.name} size="sm" />
                      <div className="hbar-body">
                        <div className="hbar-top">
                          <span className="name">{r.category.name}</span>
                          <span className="value">{formatEuros(r.spentCents)}</span>
                        </div>
                        <div className="hbar" aria-hidden>
                          <div className={'tone-' + categoryStyle(r.category.name).tone + ' fill-tone'} style={{ width: `${(r.spentCents / topCategories[0].spentCents) * 100}%` }} />
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            </section>
          )}
        </div>
      </div>

      {editing && <ExpenseForm {...props} expense={editing} onClose={() => setEditing(null)} />}
    </>
  );
}

/** Tarjeta principal: gasto del mes frente al presupuesto común. */
export function SpendCard({ spent, budgetedSpent = spent, budget, count, isCurrent, forecast = null }: {
  spent: number;
  /** Lo gastado en categorías con presupuesto: es lo único que se compara con él. */
  budgetedSpent?: number;
  budget: number;
  count: number;
  isCurrent: boolean;
  forecast?: Forecast | null;
}) {
  const left = budget - budgetedSpent;
  const ratio = budget > 0 ? budgetedSpent / budget : 0;
  const status = budget <= 0 ? null : ratio > 1 ? 'over' : ratio >= 0.85 ? 'warn' : 'ok';

  return (
    <section className="card hero o-1" aria-label="Gasto del mes">
      <div className="hero-top">
        <div className="hero-label">
          <p className="stat-label">{isCurrent ? 'Gasto del mes' : 'Gasto de ese mes'}</p>
          {status && (
          <span className={'status-pill status-' + status}>
            <Icon name={status === 'ok' ? 'check' : 'alert'} size={15} />
            {status === 'ok' ? 'Dentro del presupuesto' : status === 'warn' ? 'Cerca del límite' : 'Por encima'}
          </span>
          )}
        </div>
        <p className="stat-big">{formatEuros(spent)}</p>
      </div>
      {budget > 0 ? (
        <>
          <Progress value={budgetedSpent} max={budget} label="Presupuesto gastado" />
          <div className="hero-foot">
            <span>
              {left >= 0 ? <>Presupuesto restante <strong>{formatEuros(left)}</strong></> : <>Os habéis pasado <strong className="negative">{formatEuros(-left)}</strong></>}
            </span>
            <span><strong>{Math.round(ratio * 100)} %</strong> de {formatEuros(budget)}</span>
          </div>
        </>
      ) : (
        <div className="hero-foot">
          <span>{count === 0 ? 'Sin gastos todavía.' : `${count} ${count === 1 ? 'gasto' : 'gastos'}.`} No hay presupuesto para este mes.</span>
          <button className="link-btn small" onClick={go('presupuesto')}>Poner presupuesto</button>
        </div>
      )}
      {forecast && <ForecastLine forecast={forecast} budget={budget} budgetedShare={spent > 0 ? budgetedSpent / spent : 1} />}
    </section>
  );
}

/** "A este ritmo, acabaréis el mes en unos 1.350 €", comparado con el presupuesto si lo hay. */
function ForecastLine({ forecast, budget, budgetedShare }: { forecast: Forecast; budget: number; budgetedShare: number }) {
  const rounded = Math.round(forecast.cents / 1000) * 1000; // a decenas de euros: es una estimación
  // Con el límite solo se compara la parte de las categorías que tienen presupuesto.
  const diff = budget - Math.round((forecast.cents * budgetedShare) / 1000) * 1000;
  return (
    <p className="forecast">
      <Icon name="chart" size={16} />
      <span>
        A este ritmo acabaréis el mes en unos <strong>{formatEuros(rounded)}</strong>
        {budget > 0 && Math.abs(diff) >= 1000 && (
          diff > 0 ? <>: os sobrarían unos {formatEuros(diff)}.</> : <>: <span className="negative">os pasaríais unos {formatEuros(-diff)}</span>.</>
        )}
        {(budget <= 0 || Math.abs(diff) < 1000) && '.'}
        {forecast.pendingFixedCents > 0 && <span className="muted"> Incluye {formatEuros(forecast.pendingFixedCents)} de gastos fijos que aún faltan.</span>}
      </span>
    </p>
  );
}
