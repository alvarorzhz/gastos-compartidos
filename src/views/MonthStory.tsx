import { useContext, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import { categoryStyle } from '../lib/categoryStyle';
import { addMonths, formatMonth, monthOf, today } from '../lib/dates';
import { formatEuros } from '../lib/money';
import { monthStory, WEEKDAYS, weekdayOf, type StorySlide } from '../lib/monthStory';
import { nameOf, partnerOf } from '../lib/people';
import { ShoppingItemsContext } from '../lib/useShopping';
import { personTone, type ViewProps } from './common';
import { Icon, type IconName } from './icons';
import { MonthCloseSheet } from './MonthClose';

/*
 * Historia del mes: pantallas a pantalla completa que se pasan solas (o tocando a los lados,
 * o deslizando), con un dato curioso del mes en cada una. Mantener pulsado la pausa y
 * deslizar hacia abajo la cierra. La última lleva al resumen en cifras de siempre.
 */

/** Lo que dura cada pantalla antes de pasar a la siguiente. */
const SLIDE_MS = 6500;

const euros = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
/** Importe redondeado a euros, para los números grandes de la historia. */
const big = (cents: number) => euros.format(Math.round(cents / 100));

const monthName = (month: string) => formatMonth(month).split(' ')[0].toLowerCase();

/** Historia del mes y, al acabar, el resumen en cifras si se pide. */
export function MonthRecap(props: ViewProps & { month: string; onClose: () => void }) {
  const [numbers, setNumbers] = useState(false);
  if (numbers) return <MonthCloseSheet {...props} />;
  return <MonthStoryViewer {...props} onNumbers={() => setNumbers(true)} />;
}

/** ¿Hay algo que contar de ese mes? */
export function hasStory(props: ViewProps, month: string): boolean {
  return props.data.expenses.some((e) => monthOf(e.spent_on) === month);
}

function useReducedMotion(): boolean {
  const [reduced] = useState(() => {
    try {
      return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    } catch {
      return false;
    }
  });
  return reduced;
}

function MonthStoryViewer({ data, me, month, onClose, onNumbers }: ViewProps & { month: string; onClose: () => void; onNumbers: () => void }) {
  const items = useContext(ShoppingItemsContext);
  const story = useMemo(() => monthStory(data, me, month, items, today()), [data, me, month, items]);
  const slides = story.slides;
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [held, setHeld] = useState(false);
  const reduced = useReducedMotion();
  const bar = useRef<HTMLDivElement>(null);
  const root = useRef<HTMLDivElement>(null);
  const elapsed = useRef(0);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const last = slides.length - 1;
  const slide = slides[Math.min(index, last)];

  function go(to: number) {
    if (to < 0) to = 0;
    if (to > last) return;
    elapsed.current = 0;
    setIndex(to);
  }
  const goRef = useRef(go);
  goRef.current = go;
  const indexRef = useRef(index);
  indexRef.current = index;

  // Avance automático: la barra de arriba se llena y al terminar pasa a la siguiente.
  useEffect(() => {
    const el = bar.current;
    if (!el) return;
    const stopped = reduced || index === last;
    if (stopped) {
      el.style.transform = 'scaleX(1)';
      return;
    }
    el.style.transform = `scaleX(${elapsed.current / SLIDE_MS})`;
    if (paused || held) return;
    const start = performance.now() - elapsed.current;
    let frame = 0;
    const tick = (now: number) => {
      elapsed.current = now - start;
      const f = Math.min(1, elapsed.current / SLIDE_MS);
      el.style.transform = `scaleX(${f})`;
      if (f >= 1) goRef.current(index + 1);
      else frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [index, paused, held, reduced, last]);

  // Teclado, scroll de fondo bloqueado y foco dentro.
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeRef.current();
      else if (e.key === 'ArrowRight') goRef.current(indexRef.current + 1);
      else if (e.key === 'ArrowLeft') goRef.current(indexRef.current - 1);
      else if (e.key === ' ' && !(e.target as HTMLElement).closest('button')) {
        e.preventDefault();
        setPaused((p) => !p);
      }
    };
    document.addEventListener('keydown', onKey);
    document.body.classList.add('no-scroll');
    root.current?.focus({ preventScroll: true });
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.classList.remove('no-scroll');
      previous?.focus?.({ preventScroll: true });
    };
  }, []);
  // Toques: a la izquierda vuelve, a la derecha avanza; mantener pausa; deslizar pasa o cierra.
  const touch = useRef<{ x: number; y: number; timer: number; holding: boolean } | null>(null);
  function onDown(e: ReactPointerEvent) {
    if ((e.target as HTMLElement).closest('button')) return;
    const timer = window.setTimeout(() => {
      if (touch.current) touch.current.holding = true;
      setHeld(true);
    }, 220);
    touch.current = { x: e.clientX, y: e.clientY, timer, holding: false };
  }
  function onUp(e: ReactPointerEvent) {
    const t = touch.current;
    touch.current = null;
    if (!t) return;
    clearTimeout(t.timer);
    setHeld(false);
    const dx = e.clientX - t.x;
    const dy = e.clientY - t.y;
    if (dy > 90 && dy > Math.abs(dx)) return onClose();
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy)) return go(index + (dx < 0 ? 1 : -1));
    if (t.holding) return;
    const box = e.currentTarget.getBoundingClientRect();
    go(index + (e.clientX - box.left < box.width * 0.3 ? -1 : 1));
  }
  function onCancel() {
    if (touch.current) clearTimeout(touch.current.timer);
    touch.current = null;
    setHeld(false);
  }

  if (!slide) return null;
  const title = `Historia de ${formatMonth(month).toLowerCase()}`;

  return (
    <div className="story-backdrop">
      <div
        className={'story theme-' + slide.kind}
        ref={root}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
      >
        <div className="story-bars" aria-hidden>
          {slides.map((_, i) => (
            <span key={i} className="story-bar">
              <span
                className="story-bar-fill"
                ref={i === index ? bar : undefined}
                style={i === index ? undefined : { transform: `scaleX(${i < index ? 1 : 0})` }}
              />
            </span>
          ))}
        </div>
        <header className="story-top">
          <span className="story-brand">
            <img src="/icon.svg" alt="" />
            {formatMonth(month)}
            {story.partial && <span className="story-tag">hasta hoy</span>}
          </span>
          {!reduced && index < last && (
            <button className="story-icon" onClick={() => setPaused((p) => !p)} aria-label={paused ? 'Seguir' : 'Pausar'}>
              <Icon name={paused ? 'play' : 'pause'} />
            </button>
          )}
          <button className="story-icon" onClick={onClose} aria-label="Cerrar">
            <Icon name="close" />
          </button>
        </header>

        <div
          className="story-stage"
          onPointerDown={onDown}
          onPointerUp={onUp}
          onPointerCancel={onCancel}
          onContextMenu={(e) => e.preventDefault()}
        >
          <div className="story-slide" key={index} role="group" aria-roledescription="pantalla" aria-label={`${index + 1} de ${slides.length}`} aria-live="polite">
            <Slide slide={slide} data={data} me={me} month={month} partial={story.partial} />
            {slide.kind === 'outro' && (
              <div className="story-actions">
                <button className="story-btn primary" onClick={onNumbers}><Icon name="list" size={18} /> Ver en cifras</button>
                <div className="row">
                  <button className="story-btn" onClick={() => go(0)}><Icon name="undo" size={18} /> Volver a ver</button>
                  <button className="story-btn" onClick={onClose}>Cerrar</button>
                </div>
              </div>
            )}
          </div>
          <button className="story-arrow prev" onClick={() => go(index - 1)} disabled={index === 0} aria-label="Pantalla anterior">
            <Icon name="chevronLeft" />
          </button>
          <button className="story-arrow next" onClick={() => go(index + 1)} disabled={index === last} aria-label="Pantalla siguiente">
            <Icon name="chevronRight" />
          </button>
        </div>
      </div>
    </div>
  );
}

function Head({ icon, kicker, children }: { icon: IconName; kicker: string; children?: ReactNode }) {
  return (
    <>
      <span className="story-badge s-in"><Icon name={icon} size={28} /></span>
      <p className="story-kicker s-in d1">{kicker}</p>
      {children}
    </>
  );
}

function Delta({ cents, previous, label }: { cents: number; previous: number; label: string }) {
  if (previous <= 0) return null;
  const d = cents - previous;
  if (Math.abs(d) < 100) return <p className="story-text s-in d3">Casi lo mismo que en {label}.</p>;
  const pct = Math.round((Math.abs(d) * 100) / previous);
  return (
    <p className="story-text s-in d3">
      <span className="story-chip"><Icon name={d > 0 ? 'arrowUp' : 'arrowDown'} size={15} /> {pct} %</span>{' '}
      {big(Math.abs(d))} {d > 0 ? 'más' : 'menos'} que en {label}
    </p>
  );
}

function Slide({ slide: s, data, me, month, partial }: { slide: StorySlide; data: ViewProps['data']; me: string; month: string; partial: boolean }) {
  const name = monthName(month);
  const prevName = monthName(addMonths(month, -1));
  const partner = partnerOf(data.members, me);

  switch (s.kind) {
    case 'intro':
      return (
        <div className="story-center">
          <div className="story-rings s-in" aria-hidden><span /><span /><b>€</b></div>
          <p className="story-kicker s-in d1">{data.household.name}</p>
          <h2 className="story-title s-in d2">{partial ? `Así va vuestro ${name}` : `Así fue vuestro ${name}`}</h2>
          <p className="story-text s-in d3">
            {s.count} {s.count === 1 ? 'gasto' : 'gastos'} en {s.activeDays} {s.activeDays === 1 ? 'día' : 'días distintos'}.
          </p>
          <p className="story-hint s-in d4">Toca a la derecha para seguir</p>
        </div>
      );

    case 'total': {
      const max = Math.max(...s.history.map((h) => h.cents), 1);
      return (
        <>
          <Head icon="coins" kicker={partial ? 'Lleváis gastado' : 'En total gastasteis'}>
            <p className="story-big s-pop d2">{big(s.spentCents)}</p>
            <Delta cents={s.spentCents} previous={s.previousCents} label={prevName} />
          </Head>
          {s.history.length > 1 && (
            <div className="story-cols s-in d4" role="img" aria-label="Gasto de los últimos meses">
              {s.history.map((h, i) => (
                <div key={h.month} className={'story-col' + (h.month === month ? ' on' : '')}>
                  <span className="story-col-value">{big(h.cents)}</span>
                  <span className="story-col-bar" style={{ height: `${Math.max(4, (h.cents / max) * 100)}%`, animationDelay: `${450 + i * 70}ms` }} />
                  <span className="story-col-label">{monthName(h.month).slice(0, 3)}</span>
                </div>
              ))}
            </div>
          )}
        </>
      );
    }

    case 'category': {
      const style = categoryStyle(s.name);
      return (
        <>
          <Head icon={style.icon} kicker="Vuestra categoría estrella">
            <h2 className="story-title s-pop d2">{s.name}</h2>
            <p className="story-text s-in d3">
              {big(s.cents)}, el <strong>{Math.round(s.share * 100)} %</strong> de {s.withoutFixed ? 'lo que gastasteis sin contar los fijos' : 'todo lo que gastasteis'}.
            </p>
            <Delta cents={s.cents} previous={s.previousCents} label={prevName} />
          </Head>
          {s.top.length > 1 && (
            <ul className="story-hbars s-in d4">
              {s.top.map((c, i) => (
                <li key={c.name}>
                  <span className="story-hbar-top"><span>{c.name}</span><span>{big(c.cents)}</span></span>
                  <span className="story-hbar"><span style={{ width: `${(c.cents / s.top[0].cents) * 100}%`, animationDelay: `${500 + i * 90}ms` }} /></span>
                </li>
              ))}
            </ul>
          )}
        </>
      );
    }

    case 'place':
      return (
        <div className="story-center">
          <Head icon="cart" kicker="Vuestro sitio favorito">
            <p className="story-big s-pop d2">{s.visits} veces</p>
            <p className="story-title sm s-in d3">en {s.name}</p>
            <p className="story-text s-in d4">Y os dejasteis {big(s.cents)} allí, unos {big(s.cents / s.visits)} cada vez.</p>
          </Head>
          {s.others.length > 0 && (
            <p className="story-text dim s-in d5">
              Después: {s.others.map((o) => `${o.name} (${o.visits})`).join(', ')}.
            </p>
          )}
        </div>
      );

    case 'weekday': {
      const max = Math.max(...s.byWeekday, 1);
      const day = WEEKDAYS[s.weekday];
      return (
        <>
          <Head icon="calendar" kicker="Vuestro día de gastar">
            <h2 className="story-title s-pop d2">Los {day.endsWith('s') ? day : day + 's'}</h2>
            <p className="story-text s-in d3">Se os fueron {big(s.cents)} en {day}, el día de la semana en que más gastasteis.</p>
          </Head>
          <div className="story-cols s-in d4" role="img" aria-label="Gasto por día de la semana">
            {s.byWeekday.map((c, i) => (
              <div key={i} className={'story-col' + (i === s.weekday ? ' on' : '')}>
                <span className="story-col-bar" style={{ height: `${Math.max(4, (c / max) * 100)}%`, animationDelay: `${450 + i * 60}ms` }} />
                <span className="story-col-label">{'LMXJVSD'[i]}</span>
              </div>
            ))}
          </div>
        </>
      );
    }

    case 'biggest': {
      const [y, m, d] = s.date.split('-').map(Number);
      const when = new Date(y, m - 1, d).toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' });
      return (
        <div className="story-center">
          <Head icon="star" kicker="El gasto más gordo">
            <p className="story-big s-pop d2">{big(s.cents)}</p>
            <p className="story-title sm s-in d3">{s.note ?? s.categoryName}</p>
            <p className="story-text s-in d4">El {when}{s.note ? `, en ${s.categoryName}` : ''}.</p>
          </Head>
        </div>
      );
    }

    case 'budget': {
      const ratio = s.spentCents / s.budgetCents;
      const ok = ratio <= 1;
      const r = 54;
      const len = 2 * Math.PI * r;
      return (
        <div className="story-center">
          <Head icon="target" kicker="El presupuesto">
            <div className="story-ring s-pop d2" role="img" aria-label={`${Math.round(ratio * 100)} % del presupuesto`}>
              <svg viewBox="0 0 128 128" aria-hidden>
                <circle cx="64" cy="64" r={r} className="track" />
                <circle cx="64" cy="64" r={r} className="value" style={{ strokeDasharray: len, ['--ring-off' as string]: `${len * (1 - Math.min(ratio, 1))}` }} />
              </svg>
              <b>{Math.round(ratio * 100)} %</b>
            </div>
            <h2 className="story-title sm s-in d3">
              {partial ? (ok ? `Os quedan ${big(s.budgetCents - s.spentCents)}` : `Vais ${big(s.spentCents - s.budgetCents)} por encima`)
                : ok ? '¡Presupuesto cumplido!' : `Os pasasteis ${big(s.spentCents - s.budgetCents)}`}
            </h2>
            <p className="story-text s-in d4">
              {ok
                ? `${big(s.spentCents)} de ${big(s.budgetCents)}${partial ? ' por ahora' : `: sobraron ${big(s.budgetCents - s.spentCents)}`}.`
                : `${big(s.spentCents)} de ${big(s.budgetCents)}.`}
              {s.overBudget.length > 0 && ` Se pasaron: ${s.overBudget.slice(0, 3).map((o) => `${o.name} (+${big(o.overCents)})`).join(', ')}.`}
            </p>
          </Head>
        </div>
      );
    }

    case 'payers': {
      const mine = s.paidBy.find((p) => p.userId === me);
      return (
        <div className="story-center">
          <Head icon="users" kicker="Quién puso el dinero">
            <h2 className="story-title s-pop d2">{mine ? `Tú, el ${Math.round(mine.share * 100)} %` : `${partner?.display_name ?? 'Tu pareja'}, todo`}</h2>
          </Head>
          <div className="story-split" aria-hidden>
            {s.paidBy.map((p) => (
              <span key={p.userId} className={'fill-person-' + personTone(data.members, p.userId)} style={{ flexGrow: p.share }} />
            ))}
          </div>
          <ul className="story-legend s-in d4">
            {s.paidBy.map((p) => (
              <li key={p.userId}>
                <span className={'dot fill-person-' + personTone(data.members, p.userId)} />
                {nameOf(data.members, p.userId, me)} <strong>{big(p.cents)}</strong>
              </li>
            ))}
          </ul>
          {partner && (
            <p className="story-text s-in d5">
              {s.balanceCents === 0
                ? 'Y hoy estáis en paz 🤍'
                : s.balanceCents > 0
                  ? `Para quedar en paz, hoy ${partner.display_name} te pasa ${formatEuros(s.balanceCents)}.`
                  : `Para quedar en paz, hoy le pasas ${formatEuros(-s.balanceCents)} a ${partner.display_name}.`}
            </p>
          )}
        </div>
      );
    }

    case 'savings':
      return (
        <>
          <Head icon="piggy" kicker="Vuestras huchas">
            <p className="story-big s-pop d2">+{big(s.contributedCents)}</p>
            <p className="story-text s-in d3">ahorrados entre los dos este mes.</p>
          </Head>
          {s.goals.length > 0 && (
            <ul className="story-hbars s-in d4">
              {s.goals.map((g, i) => (
                <li key={g.name}>
                  <span className="story-hbar-top"><span>{g.name}</span><span>{Math.round(Math.min(g.ratio, 1) * 100)} %</span></span>
                  <span className="story-hbar"><span style={{ width: `${Math.min(g.ratio, 1) * 100}%`, animationDelay: `${500 + i * 90}ms` }} /></span>
                  <span className="story-hbar-sub">{big(g.savedCents)} de {big(g.targetCents)}</span>
                </li>
              ))}
            </ul>
          )}
        </>
      );

    case 'shopping':
      return (
        <div className="story-center">
          <Head icon="list" kicker="La lista de la compra">
            <p className="story-big s-pop d2">{s.itemsBought}</p>
            <p className="story-title sm s-in d3">productos tachados</p>
            {s.tickets > 0 && <p className="story-text s-in d4">en {s.tickets} {s.tickets === 1 ? 'compra con ticket' : 'compras con ticket'}.</p>}
            {s.topProduct && (
              <p className="story-text s-in d5">
                Lo que más cayó: <strong>{s.topProduct.name}</strong>, {s.topProduct.times} veces.
              </p>
            )}
          </Head>
        </div>
      );

    case 'trips':
      return (
        <div className="story-center">
          <Head icon="suitcase" kicker="Viajes y planes">
            {s.events.length === 1 ? (
              <>
                <p className="story-big s-pop d2">{big(s.events[0].cents)}</p>
                <p className="story-title sm s-in d3">en {s.events[0].name}</p>
                <p className="story-text s-in d4">Lo que gastasteis juntos en el plan del mes.</p>
              </>
            ) : (
              <>
                <h2 className="story-title s-pop d2">{s.events.length} planes</h2>
                <ul className="story-legend col s-in d3">
                  {s.events.slice(0, 4).map((e) => (
                    <li key={e.name}><Icon name="suitcase" size={16} /> {e.name} <strong>{big(e.cents)}</strong></li>
                  ))}
                </ul>
              </>
            )}
          </Head>
        </div>
      );

    case 'calm': {
      const offset = weekdayOf(month);
      return (
        <>
          <Head icon="heart" kicker="Días sin gastar">
            <p className="story-big s-pop d2">{s.quietDays} {s.quietDays === 1 ? 'día' : 'días'}</p>
            <p className="story-text s-in d3">
              sin ningún gasto común.{s.longestQuiet >= 2 && <> Vuestra mejor racha: <strong>{s.longestQuiet} días seguidos</strong>.</>}
            </p>
          </Head>
          <div className="story-cal s-in d4" role="img" aria-label={`Calendario del mes: ${s.quietDays} días sin gastos`}>
            {'LMXJVSD'.split('').map((l, i) => <span key={'h' + i} className="story-cal-head">{l}</span>)}
            {Array.from({ length: offset }, (_, i) => <span key={'e' + i} />)}
            {s.days.map((d, i) => (
              <span key={d.date} className={'story-cal-day' + (d.spent ? ' spent' : '')} style={{ animationDelay: `${450 + i * 18}ms` }}>
                {Number(d.date.slice(8))}
              </span>
            ))}
          </div>
          <p className="story-text dim s-in d5"><span className="story-cal-key" aria-hidden /> Con círculo, los días sin gastos.</p>
        </>
      );
    }

    case 'outro':
      return (
        <div className="story-center">
          <div className="story-rings small s-in" aria-hidden><span /><span /><b>€</b></div>
          <p className="story-kicker s-in d1">{formatMonth(month)}, en resumen</p>
          <p className="story-big s-pop d2">{big(s.spentCents)}</p>
          {s.highlights.length > 0 && (
            <ul className="story-highlights s-in d3">
              {s.highlights.map((h) => <li key={h}>{h}</li>)}
            </ul>
          )}
          {partial && <p className="story-text dim s-in d4">El mes aún no ha terminado: el día 1 tendréis la historia completa.</p>}
        </div>
      );
  }
}
