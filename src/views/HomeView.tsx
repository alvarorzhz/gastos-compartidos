import { useEffect, useState, type ReactNode } from 'react';
import { alertText, budgetAlerts } from '../lib/alerts';
import { balanceFor, roundBalance } from '../lib/balance';
import { calendarStats, dayTotals, heatLevel, monthGrid, upcomingFixed } from '../lib/calendar';
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
import type { Expense, SavingsGoal } from '../lib/types';
import { chosenOne, moodText, rankWishes, waitingForMe } from '../lib/wishes';
import { Avatar, CategoryIcon, CountUp, celebrate, EmptyState, MonthNav, Notice, personTone, Ring, SectionHeader, toast, type ViewProps, useMonth } from './common';
import { ExpenseForm } from './lazy';
import Challenges from './Challenges';
import Duplicates from './Duplicates';
import FixedSuggestions from './FixedSuggestions';
import { ExpenseRow } from './ExpenseRow';
import { useListMotion } from './motion';
import { Icon, type IconName } from './icons';
import { hasStory, MonthRecap } from './MonthStory';
import { ForecastInfo } from './ForecastInfo';

const go = (view: string) => () => {
  location.hash = '#' + view;
};

/*
 * Pantalla de inicio (rediseñada en la 3.23.0 con aire de iPhone): arriba lo del mes con su
 * anillo, luego los avisos que piden algo, una rejilla de «widgets» (saldo, hucha, quién paga,
 * caprichos y calendario) y, al final, los últimos movimientos y en qué se os va.
 */
export default function HomeView(props: ViewProps & { onAdd: () => void; quiet?: boolean }) {
  const { data, me, onAdd, quiet = false } = props;
  const [month, setMonth] = useMonth();
  const recentRef = useListMotion<HTMLUListElement>('li');
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
  const alerts = isCurrent ? budgetAlerts(month, data.categories, data.expenses, data.budgets) : [];
  const recent = monthExpenses.slice(0, 5);
  const streak = budgetStreak(today(), data.categories, data.expenses, data.budgets);

  // Widgets pequeños de dos en dos; si quedan impares, el último ocupa toda la fila.
  const small: { key: string; node: ReactNode }[] = [];
  if (partner) small.push({ key: 'saldo', node: <BalanceWidget {...props} partnerId={partner.user_id} /> });
  const goal = latestGoal(data);
  if (goal) small.push({ key: 'hucha', node: <GoalWidget {...props} goal={goal} /> });
  if (partner && sum.spentCents > 0) small.push({ key: 'pagos', node: <PayersWidget {...props} month={month} isCurrent={isCurrent} /> });
  small.push({ key: 'deseos', node: <WishWidget {...props} /> });

  return (
    <>
      <MonthNav month={month} onChange={setMonth} compact />

      <div className="home-grid">
        <div className="home-col">
          <SpendCard
            spent={sum.spentCents}
            budgetedSpent={sum.budgetedSpentCents}
            budget={sum.budgetCents}
            count={monthExpenses.length}
            isCurrent={isCurrent}
            month={month}
            forecast={isCurrent ? monthForecast(today(), data.expenses, data.recurring) : null}
            streak={isCurrent ? streak : 0}
          />

          <div className="home-feed">
            {partner && <PartnerActivity {...props} partnerId={partner.user_id} onOpen={setEditing} />}
            {isCurrent && <GoodMonth month={addMonths(month, -1)} streak={streak} quiet={quiet} />}
            {alerts.map((a) => (
              <Notice key={a.category.id} kind={a.spentCents > a.budgetCents ? 'over' : 'warn'}>{alertText(a)}</Notice>
            ))}
            {offerStory && (
              <button className="story-card" onClick={() => setStory(storyMonth)}>
                <span className="story-card-icon"><Icon name="sparkles" /></span>
                <span className="grow">
                  <strong>Vuestro {formatMonth(storyMonth).split(' ')[0].toLowerCase()}, en historia</strong>
                  <span>El mes contado en pantallas, con sus datos curiosos.</span>
                </span>
                <Icon name="play" />
              </button>
            )}
            {isCurrent && <Duplicates {...props} onOpen={setEditing} />}
            {isCurrent && <FixedSuggestions {...props} />}
            {!partner && (
              <Notice icon="users" action={<button className="sm tinted" onClick={go('ajustes')}>Invitar</button>}>
                Aún estás solo/a en este espacio. Invita a tu pareja desde Ajustes para compartir los gastos.
              </Notice>
            )}
          </div>

          <div className="widgets">
            {small.map((w, i) => (
              <div key={w.key} className={'widget-slot' + (small.length % 2 === 1 && i === small.length - 1 ? ' widget-wide' : '')}>{w.node}</div>
            ))}
            <div className="widget-slot widget-wide"><CalendarWidget {...props} month={month} /></div>
          </div>

          {isCurrent && <Challenges {...props} />}
        </div>

        <div className="home-col">
          <section className="section" aria-labelledby="home-recent">
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
              <ul className="list with-icons" ref={recentRef}>
                {recent.map((e) => (
                  <ExpenseRow key={e.id} expense={e} data={data} me={me} onOpen={setEditing} showDate />
                ))}
              </ul>
            )}
          </section>

          <CategoryBreakdown rows={rows} total={sum.spentCents} />
        </div>
      </div>

      {editing && <ExpenseForm {...props} expense={editing} onClose={() => setEditing(null)} />}
      {story && <MonthRecap {...props} month={story} onClose={() => setStory(null)} />}
    </>
  );
}

type BudgetStatus = 'ok' | 'warn' | 'over';

/** Tarjeta principal: gasto del mes con un anillo del presupuesto, como los de Actividad. */
export function SpendCard({ spent, budgetedSpent = spent, budget, count, isCurrent, month, forecast = null, streak = 0 }: {
  spent: number;
  /** Lo gastado en categorías con presupuesto: es lo único que se compara con él. */
  budgetedSpent?: number;
  budget: number;
  count: number;
  isCurrent: boolean;
  month?: string;
  forecast?: Forecast | null;
  /** Meses seguidos dentro del presupuesto hasta el pasado. */
  streak?: number;
}) {
  const left = budget - budgetedSpent;
  const ratio = budget > 0 ? budgetedSpent / budget : 0;
  const status: BudgetStatus | null = budget <= 0 ? null : ratio > 1 ? 'over' : ratio >= 0.85 ? 'warn' : 'ok';
  const monthName = month ? formatMonth(month).split(' ')[0].toLowerCase() : '';

  return (
    <section className="card hero" aria-label="Gasto del mes">
      <div className="hero-main">
        <div className="hero-text">
          <p className="hero-kicker">{isCurrent ? 'Lleváis gastado' : `Gastasteis en ${monthName}`}</p>
          <p className="stat-big"><CountUp cents={spent} /></p>
          {status ? (
            <span className={'status-pill status-' + status}>
              <Icon name={status === 'ok' ? 'check' : 'alert'} size={15} />
              {status === 'ok' ? (isCurrent ? 'Vais bien' : 'Bien hecho') : status === 'warn' ? (isCurrent ? 'Vais justos' : 'Muy justos') : 'Os habéis pasado'}
            </span>
          ) : (
            <span className="hero-sub">{count === 0 ? 'Sin gastos todavía' : `${count} ${count === 1 ? 'gasto' : 'gastos'}`}</span>
          )}
        </div>
        {budget > 0 && (
          <Ring ratio={ratio} size={104} stroke={13} tone={status ?? 'ok'} label={`Presupuesto gastado: ${Math.round(ratio * 100)} %`} className="hero-ring">
            <strong>{Math.round(ratio * 100)}<small>%</small></strong>
          </Ring>
        )}
      </div>
      {budget > 0 ? (
        <dl className="hero-facts">
          <div>
            <dt>{left >= 0 ? 'Quedan' : 'Os pasáis'}</dt>
            <dd className={left < 0 ? 'negative' : ''}><CountUp cents={Math.abs(left)} fromZero={false} /></dd>
          </div>
          <div>
            <dt>Presupuesto</dt>
            <dd>{formatEuros(budget)}</dd>
          </div>
          <div>
            <dt>Gastos</dt>
            <dd>{count}</dd>
          </div>
        </dl>
      ) : (
        <div className="hero-foot">
          <span>No hay presupuesto para este mes.</span>
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

/** Cabecera de un widget: icono de color y título, como en la pantalla de inicio del iPhone. */
function WidgetHead({ icon, tone, title }: { icon: IconName; tone: string; title: string }) {
  return (
    <span className="widget-head">
      <span className={'widget-glyph widget-glyph-' + tone}><Icon name={icon} size={14} /></span>
      <span className="widget-title">{title}</span>
    </span>
  );
}

/** Saldo entre los dos, en grande. */
function BalanceWidget({ data, me, partnerId }: ViewProps & { partnerId: string }) {
  const balance = roundBalance(balanceFor(me, data.expenses, data.settlements));
  const partnerName = nameOf(data.members, partnerId);
  return (
    <button className="widget" onClick={go('saldo')} aria-label={`Saldo entre los dos: ${balance === 0 ? 'estáis en paz' : balance > 0 ? `${partnerName} te pasa ${formatEuros(balance)}` : `le pasas ${formatEuros(-balance)} a ${partnerName}`}`}>
      <WidgetHead icon="swap" tone="blue" title="Saldo" />
      <span className="avatar-pair widget-avatars">
        <Avatar members={data.members} userId={me} size="sm" />
        <Avatar members={data.members} userId={partnerId} size="sm" />
      </span>
      <span className="widget-value">{balance === 0 ? 'En paz' : <CountUp cents={Math.abs(balance)} fromZero={false} />}</span>
      <span className="widget-caption">{balance === 0 ? 'No os debéis nada 🤍' : balance > 0 ? `${partnerName} te pasa` : `Le pasas a ${partnerName}`}</span>
    </button>
  );
}

/** La hucha en la que más recientemente se ha puesto dinero. */
function latestGoal(data: ViewProps['data']): SavingsGoal | null {
  const active = data.goals.filter((g) => !g.archived);
  if (active.length === 0) return null;
  const lastMove = (id: string) => data.contributions.find((c) => c.goal_id === id)?.created_at ?? '';
  return [...active].sort((a, b) => (lastMove(b.id) || b.created_at).localeCompare(lastMove(a.id) || a.created_at))[0];
}

/** Hucha común con un anillo de lo que lleva cada uno. */
function GoalWidget({ data, goal }: ViewProps & { goal: SavingsGoal }) {
  const p = goalProgress(goal, data.contributions);
  const left = goal.target_cents - p.savedCents;
  const pct = Math.min(100, Math.round(p.ratio * 100));
  const segments = data.members.map((m) => ({
    share: Math.max(0, p.byUser.get(m.user_id) ?? 0) / goal.target_cents,
    className: 'stroke-person-' + personTone(data.members, m.user_id),
  }));
  return (
    <button className="widget" onClick={go('presupuesto')} aria-label={`Hucha ${goal.name}: ${pct} %`}>
      <WidgetHead icon="piggy" tone="pink" title="Hucha" />
      <span className="widget-row">
        <Ring segments={segments} size={54} stroke={7} label={`${pct} % de ${goal.name}`}>
          <strong className="widget-ring-pct">{pct}%</strong>
        </Ring>
        <span className="widget-name">{goal.name}</span>
      </span>
      <span className="widget-caption">
        {left > 0 ? `Faltan ${formatEuros(left)}` : '¡Conseguido! 🎉'}
      </span>
    </button>
  );
}

/** Quién ha pagado más este mes, en un anillo de dos colores. */
function PayersWidget({ data, me, month, isCurrent }: ViewProps & { month: string; isCurrent: boolean }) {
  const byPayer = breakdown(data.expenses, month, (e) => e.paid_by);
  const top = byPayer[0];
  return (
    <button className="widget" onClick={go('gastos')} aria-label={`Quién ha pagado ${isCurrent ? 'este mes' : 'ese mes'}: ${byPayer.map((s) => `${nameOf(data.members, s.id, me)} ${Math.round(s.share * 100)} %`).join(', ')}`}>
      <WidgetHead icon="users" tone="green" title="Quién paga" />
      <span className="widget-row">
        <Ring segments={byPayer.map((s) => ({ share: s.share, className: 'stroke-person-' + personTone(data.members, s.id) }))} size={54} stroke={7} label="Reparto de lo pagado">
          {top && <Avatar members={data.members} userId={top.id} size="sm" />}
        </Ring>
        <span className="widget-legend">
          {byPayer.map((s) => (
            <span key={s.id}>
              <span className={'dot fill-person-' + personTone(data.members, s.id)} />
              {nameOf(data.members, s.id, me)} <strong>{Math.round(s.share * 100)}%</strong>
            </span>
          ))}
        </span>
      </span>
      <span className="widget-caption">{top ? `${nameOf(data.members, top.id, me)} ${top.id === me ? 'has' : 'ha'} pagado ${formatEuros(top.cents)}` : ''}</span>
    </button>
  );
}

/** Caprichos: el elegido por los dos o los que esperan tu voto. */
function WishWidget({ data, me }: ViewProps) {
  const memberIds = data.members.map((m) => m.user_id);
  const chosen = chosenOne(rankWishes(data.wishes, data.wishVotes, memberIds, 'treat'));
  const waiting = waitingForMe(data.wishes, data.wishVotes, me).length;
  const open = data.wishes.filter((w) => !w.done_at).length;
  return (
    <button className="widget" onClick={go('deseos')}>
      <WidgetHead icon="sparkles" tone="purple" title="Caprichos" />
      {chosen ? (
        <>
          <span className="widget-kicker">El elegido</span>
          <span className="widget-name widget-name-lg">{chosen.wish.name}</span>
          <span className="widget-caption">{waiting > 0 ? `y ${waiting} por votar` : moodText(chosen)}</span>
        </>
      ) : waiting > 0 ? (
        <>
          <span className="widget-value">{waiting}</span>
          <span className="widget-caption">{waiting === 1 ? 'espera tu voto' : 'esperan tu voto'}</span>
        </>
      ) : open > 0 ? (
        <>
          <span className="widget-value">{open}</span>
          <span className="widget-caption">{open === 1 ? 'en la lista' : 'en la lista'} · votad para elegir</span>
        </>
      ) : (
        <>
          <span className="widget-name">¿Qué os apetece?</span>
          <span className="widget-caption">Apuntad caprichos y deseos y votadlos</span>
        </>
      )}
    </button>
  );
}

/** El mes en puntos de colores (más intenso, más gasto) que abre el calendario. */
function CalendarWidget({ data, month }: ViewProps & { month: string }) {
  const todayIso = today();
  const totals = dayTotals(data.expenses, month);
  const max = Math.max(0, ...[...totals.values()].map((t) => t.cents));
  const stats = calendarStats(totals, month, todayIso);
  const fixed = upcomingFixed(data.recurring, month, todayIso);
  const isCurrent = month === monthOf(todayIso);
  const todayCents = totals.get(todayIso)?.cents ?? 0;
  return (
    <button className="widget widget-calendar" onClick={go('calendario')} aria-label={`Calendario de ${formatMonth(month)}: ${stats.quietDays} días sin gastar`}>
      <span className="widget-cal-side">
        <WidgetHead icon="calendar" tone="red" title="Calendario" />
        <span className="widget-value">{stats.quietDays}<small> {stats.quietDays === 1 ? 'día' : 'días'}</small></span>
        <span className="widget-caption">
          sin gastar{isCurrent ? ` · hoy ${todayCents > 0 ? formatEuros(todayCents) : 'nada'}` : ''}
          {fixed.size > 0 && <><br />{fixed.size === 1 ? '1 fijo por llegar' : `${[...fixed.values()].flat().length} fijos por llegar`}</>}
        </span>
      </span>
      <span className="widget-cal-grid" aria-hidden>
        {monthGrid(month).flat().map((d) => (
          monthOf(d) !== month
            ? <span key={d} className="widget-cal-dot cal-out" />
            : <span key={d} className={'widget-cal-dot cal-level-' + heatLevel(totals.get(d)?.cents ?? 0, max) + (d === todayIso ? ' cal-today' : '') + (fixed.has(d) ? ' cal-has-fixed' : '')} />
        ))}
      </span>
    </button>
  );
}

/** En qué se os va: una barra de colores como la del almacenamiento del iPhone y la lista. */
function CategoryBreakdown({ rows, total }: { rows: ReturnType<typeof monthlySummary>; total: number }) {
  const spent = rows.filter((r) => r.spentCents > 0);
  if (spent.length === 0 || total <= 0) return null;
  const top = spent.slice(0, 5);
  const rest = spent.slice(5).reduce((a, r) => a + r.spentCents, 0);
  return (
    <section className="section" aria-labelledby="home-categories">
      <SectionHeader
        id="home-categories"
        title="En qué se os va"
        action={<button className="link-btn small" onClick={go('presupuesto')}>Ver presupuesto</button>}
      />
      <div className="card storage">
        <div className="storage-bar" aria-hidden>
          {top.map((r) => (
            <span key={r.category.id} className={'tone-' + categoryStyle(r.category.name).tone + ' fill-tone'} style={{ flexGrow: r.spentCents }} />
          ))}
          {rest > 0 && <span className="storage-rest" style={{ flexGrow: rest }} />}
        </div>
        <ul className="storage-list">
          {top.map((r) => (
            <li key={r.category.id}>
              <CategoryIcon name={r.category.name} size="sm" />
              <span className="grow ellipsis">{r.category.name}</span>
              <span className="muted small">{Math.round((r.spentCents / total) * 100)} %</span>
              <span className="money">{formatEuros(r.spentCents)}</span>
            </li>
          ))}
          {rest > 0 && (
            <li>
              <span className="storage-rest-dot" aria-hidden />
              <span className="grow">Otras</span>
              <span className="muted small">{Math.round((rest / total) * 100)} %</span>
              <span className="money">{formatEuros(rest)}</span>
            </li>
          )}
        </ul>
      </div>
    </section>
  );
}

/** "A este ritmo, acabaréis el mes en unos 1.350 €", comparado con el presupuesto si lo hay, con su porqué. */
function ForecastLine({ forecast, budget, budgetedShare }: { forecast: Forecast; budget: number; budgetedShare: number }) {
  const rounded = Math.round(forecast.cents / 1000) * 1000; // a decenas de euros: es una estimación
  // Con el límite solo se compara la parte de las categorías que tienen presupuesto.
  const diff = budget - Math.round((forecast.cents * budgetedShare) / 1000) * 1000;
  const f = forecast;
  const perDay = f.variableCents / f.day;
  const shownFixed = f.pendingFixed.slice(0, 4);
  return (
    <div className="forecast">
      <Icon name="chart" size={16} />
      <div className="grow">
        <span className="forecast-text">
          A este ritmo acabaréis el mes en unos <strong>{formatEuros(rounded)}</strong>
          {budget > 0 && Math.abs(diff) >= 1000 && (
            diff > 0 ? <>: os sobrarían unos {formatEuros(diff)}.</> : <>: <span className="negative">os pasaríais unos {formatEuros(-diff)}</span>.</>
          )}
          {(budget <= 0 || Math.abs(diff) < 1000) && '.'}
          {f.pendingFixedCents > 0 && <span className="muted"> Incluye {formatEuros(f.pendingFixedCents)} de gastos fijos que aún faltan.</span>}
        </span>
        <ForecastInfo
          reliability={f.reliability}
          caveats={f.caveats}
          assumptions={<>Que seguiréis gastando en el día a día al mismo ritmo que hasta hoy y que los fijos llegan por lo de siempre. No sabe de gastos grandes que estén por venir. Se redondea a decenas de euros.</>}
        >
          <li>
            Día a día: <strong>{formatEuros(f.variableCents)}</strong> en {f.variableCount} {f.variableCount === 1 ? 'gasto' : 'gastos'} durante {f.day} días, unos {formatEuros(perDay)} al día.
            {' '}Por {f.daysInMonth} días salen unos <strong>{formatEuros(perDay * f.daysInMonth)}</strong>.
          </li>
          {f.knownCents > 0 && <li>Fijos ya apuntados y gastos con fecha más adelante: <strong>{formatEuros(f.knownCents)}</strong>. Cuentan tal cual, sin estirarlos.</li>}
          {shownFixed.length > 0 && (
            <li>
              Fijos que faltan: {shownFixed.map((x, i) => (
                <span key={x.note + x.date}>{i > 0 && ', '}{x.note} el {Number(x.date.slice(8))} ({formatEuros(x.cents)})</span>
              ))}
              {f.pendingFixed.length > shownFixed.length && ` y ${f.pendingFixed.length - shownFixed.length} más`}.
            </li>
          )}
          {budget > 0 && budgetedShare < 0.995 && (
            <li>Con el presupuesto solo se compara la parte de categorías con límite: el {Math.round(budgetedShare * 100)} % de lo gastado.</li>
          )}
        </ForecastInfo>
      </div>
    </div>
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
    <div className="good-month">
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
