import { useEffect, useState } from 'react';
import { alertText, budgetAlerts } from '../lib/alerts';
import { balanceFor } from '../lib/balance';
import { monthlySummary, totals } from '../lib/budget';
import { addMonths, formatMonth, monthOf, today } from '../lib/dates';
import { formatEuros } from '../lib/money';
import { nameOf, partnerOf } from '../lib/people';
import { categoryStyle } from '../lib/categoryStyle';
import { breakdown } from '../lib/stats';
import { budgetStreak, partnerActivity, timeAgo } from '../lib/couple';
import { saveReaction } from '../lib/reactions';
import { goalProgress } from '../lib/savings';
import { monthForecast, type Forecast } from '../lib/forecast';
import type { Expense } from '../lib/types';
import { BalanceText } from './BalanceView';
import { Avatar, CategoryIcon, celebrate, EmptyState, MonthNav, Notice, personTone, Progress, SectionHeader, toast, type ViewProps, useMonth } from './common';
import ExpenseForm from './ExpenseForm';
import FixedSuggestions from './FixedSuggestions';
import { ExpenseRow } from './ExpenseRow';
import { Icon } from './icons';
import { hasStory, MonthRecap } from './MonthStory';

const go = (view: string) => () => {
  location.hash = '#' + view;
};

/** Pantalla de inicio: cuánto lleváis gastado, cuánto queda, en qué y los últimos gastos. */
export default function HomeView(props: ViewProps & { onAdd: () => void; quiet?: boolean }) {
  const { data, me, onAdd, quiet = false } = props;
  const [month, setMonth] = useMonth();
  const [editing, setEditing] = useState<Expense | null>(null);
  const [story, setStory] = useState<string | null>(null);
  const isCurrent = month === monthOf(today());
  // Los primeros días del mes se ofrece la historia del anterior; en meses pasados, la de ese mes.
  const storyMonth = isCurrent ? (Number(today().slice(8)) <= 10 ? addMonths(month, -1) : null) : month;
  const offerStory = storyMonth != null && hasStory(props, storyMonth);

  const monthExpenses = data.expenses.filter((e) => monthOf(e.spent_on) === month);
  const rows = monthlySummary(month, data.categories, data.expenses, data.budgets);
  const sum = totals(rows);
  const partner = partnerOf(data.members, me);
  const balance = balanceFor(me, data.expenses, data.settlements);
  const alerts = isCurrent ? budgetAlerts(month, data.categories, data.expenses, data.budgets) : [];
  const topCategories = rows.filter((r) => r.spentCents > 0).slice(0, 4);
  const byPayer = breakdown(data.expenses, month, (e) => e.paid_by);
  const recent = monthExpenses.slice(0, 5);
  const streak = budgetStreak(today(), data.categories, data.expenses, data.budgets);

  return (
    <>
      {partner && <PartnerActivity {...props} partnerId={partner.user_id} onOpen={setEditing} />}

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
            streak={isCurrent ? streak : 0}
          />

          {isCurrent && <GoodMonth month={addMonths(month, -1)} streak={streak} quiet={quiet} />}

          {alerts.length > 0 && (
            <div className="stack-sm o-2" aria-label="Avisos de presupuesto">
              {alerts.map((a) => (
                <Notice key={a.category.id} kind={a.spentCents > a.budgetCents ? 'over' : 'warn'}>{alertText(a)}</Notice>
              ))}
            </div>
          )}

          {offerStory && (
            <button className="story-card o-2" onClick={() => setStory(storyMonth)}>
              <span className="story-card-icon"><Icon name="sparkles" /></span>
              <span className="grow">
                <strong>Vuestro {formatMonth(storyMonth).split(' ')[0].toLowerCase()}, en historia</strong>
                <span>El mes contado en pantallas, con sus datos curiosos.</span>
              </span>
              <Icon name="play" />
            </button>
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

          <SharedGoal {...props} />

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
      {story && <MonthRecap {...props} month={story} onClose={() => setStory(null)} />}
    </>
  );
}

/** Tarjeta principal: gasto del mes frente al presupuesto común. */
export function SpendCard({ spent, budgetedSpent = spent, budget, count, isCurrent, forecast = null, streak = 0 }: {
  spent: number;
  /** Lo gastado en categorías con presupuesto: es lo único que se compara con él. */
  budgetedSpent?: number;
  budget: number;
  count: number;
  isCurrent: boolean;
  forecast?: Forecast | null;
  /** Meses seguidos dentro del presupuesto hasta el pasado. */
  streak?: number;
}) {
  const left = budget - budgetedSpent;
  const ratio = budget > 0 ? budgetedSpent / budget : 0;
  const status = budget <= 0 ? null : ratio > 1 ? 'over' : ratio >= 0.85 ? 'warn' : 'ok';

  return (
    <section className="card hero o-1" aria-label="Gasto del mes">
      <div className="hero-top">
        <div className="hero-label">
          <p className="stat-label">{isCurrent ? 'Lo que lleváis este mes' : 'Lo que gastasteis ese mes'}</p>
          {status && (
          <span className={'status-pill status-' + status}>
            <Icon name={status === 'ok' ? 'check' : 'alert'} size={15} />
            {status === 'ok' ? (isCurrent ? 'Vais bien' : 'Bien hecho') : status === 'warn' ? (isCurrent ? 'Vais justos' : 'Muy justos') : 'Os habéis pasado'}
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
      {streak > 0 && (
        <p className="streak">
          <span aria-hidden>🔥</span>
          <span>{streak === 1 ? 'El mes pasado cumplisteis el presupuesto.' : `Lleváis ${streak} meses seguidos dentro del presupuesto.`} {status === 'over' ? '¡A recuperar la racha!' : '¡Seguid así!'}</span>
        </p>
      )}
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

/** Lo último que ha hecho tu pareja ("Marta apuntó Mercadona · hace 2 h"), con un ❤️ rápido. */
function PartnerActivity({ data, me, reload, partnerId, onOpen }: ViewProps & { partnerId: string; onOpen: (e: Expense) => void }) {
  const [busy, setBusy] = useState(false);
  const activity = partnerActivity(data, partnerId, new Date());
  if (!activity) return null;
  const expense = activity.expenseId ? data.expenses.find((e) => e.id === activity.expenseId) : undefined;
  const mine = expense ? data.reactions.find((r) => r.expense_id === expense.id && r.user_id === me) : undefined;
  const loved = mine?.emoji === '❤️';

  async function love() {
    if (!expense) return;
    setBusy(true);
    const error = await saveReaction({ householdId: data.household.id, expenseId: expense.id, me, current: mine }, { emoji: loved ? null : '❤️' });
    setBusy(false);
    if (error) return toast(error, 'error');
    await reload();
  }

  return (
    <div className="activity-card">
      <button className="activity-main" onClick={() => (expense ? onOpen(expense) : (location.hash = '#saldo'))}>
        <Avatar members={data.members} userId={partnerId} />
        <span className="grow">
          <strong>{nameOf(data.members, partnerId)}</strong> {activity.text}
          <span className="activity-when">{timeAgo(activity.at, new Date())}</span>
        </span>
      </button>
      {expense && (
        <button className={'activity-love' + (loved ? ' loved' : '')} onClick={love} disabled={busy} aria-pressed={loved} aria-label={loved ? 'Quitar el corazón' : 'Mandar un corazón'}>
          {loved ? '❤️' : '🤍'}
        </button>
      )}
    </div>
  );
}

/** La hucha común en la que más recientemente se ha puesto dinero, con lo que lleva cada uno. */
function SharedGoal({ data, me }: ViewProps) {
  const active = data.goals.filter((g) => !g.archived);
  if (active.length === 0) return null;
  const lastMove = (id: string) => data.contributions.find((c) => c.goal_id === id)?.created_at ?? '';
  const goal = [...active].sort((a, b) => (lastMove(b.id) || b.created_at).localeCompare(lastMove(a.id) || a.created_at))[0];
  const p = goalProgress(goal, data.contributions);
  const left = goal.target_cents - p.savedCents;
  const people = data.members.map((m) => ({ id: m.user_id, cents: Math.max(0, p.byUser.get(m.user_id) ?? 0) }));

  return (
    <button className="card card-link shared-goal o-3" onClick={go('presupuesto')} aria-label={`Hucha ${goal.name}: ${Math.round(p.ratio * 100)} %`}>
      <span className="shared-goal-top">
        <span className="stat-label">Vuestro objetivo</span>
        <strong>{Math.min(100, Math.round(p.ratio * 100))} %</strong>
      </span>
      <span className="shared-goal-name">{goal.name}</span>
      <span className="split-track shared-goal-track" aria-hidden>
        {people.map((x) => (
          <span key={x.id} className={'fill-person-' + personTone(data.members, x.id)} style={{ width: `${Math.min(1, x.cents / goal.target_cents) * 100}%` }} />
        ))}
      </span>
      <span className="legend">
        {people.map((x) => (
          <span key={x.id} className="legend-item">
            <span className={'dot fill-person-' + personTone(data.members, x.id)} />
            {nameOf(data.members, x.id, me)}
            <span className="money">{formatEuros(x.cents)}</span>
          </span>
        ))}
      </span>
      <span className="muted small">
        {left > 0 ? `Juntos lleváis ${formatEuros(p.savedCents)} de ${formatEuros(goal.target_cents)}. Faltan ${formatEuros(left)}.` : `¡Lo habéis conseguido! ${formatEuros(p.savedCents)} ahorrados juntos.`}
      </span>
    </button>
  );
}

const PARTY_KEY = 'gastos.fiestaMes';

/** Los primeros días del mes, si el anterior acabó dentro del presupuesto, se celebra (una vez). */
function GoodMonth({ month, streak, quiet }: { month: string; streak: number; quiet: boolean }) {
  const early = Number(today().slice(8)) <= 10;
  const [seen, setSeen] = useState(() => readPartySeen() === month);
  const show = early && streak > 0 && !seen;

  useEffect(() => {
    if (!show || quiet) return;
    const t = setTimeout(() => celebrate(`¡${formatMonth(month).split(' ')[0]} dentro del presupuesto!`), 500);
    return () => clearTimeout(t);
  }, [show, quiet, month]);

  if (!show) return null;
  const close = () => {
    try {
      localStorage.setItem(PARTY_KEY, month);
    } catch {
      // Sin almacenamiento: se vuelve a enseñar la próxima vez.
    }
    setSeen(true);
  };
  return (
    <div className="good-month o-2">
      <span className="good-month-emoji" aria-hidden>🎉</span>
      <span className="grow">
        <strong>¡{formatMonth(month).split(' ')[0]} dentro del presupuesto!</strong>
        <span>{streak === 1 ? 'Buen trabajo en equipo.' : `Ya van ${streak} meses seguidos. Buen trabajo en equipo.`}</span>
      </span>
      <button className="icon-btn" onClick={close} aria-label="Cerrar"><Icon name="close" size={18} /></button>
    </div>
  );
}

function readPartySeen(): string | null {
  try {
    return localStorage.getItem(PARTY_KEY);
  } catch {
    return null;
  }
}
