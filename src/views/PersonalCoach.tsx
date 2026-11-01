import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { compareWithNormal, CUSHION_GOAL, CUSHION_MIN, emergencyCushion, formatMonths, monthScore, SCORE_FROM_DAY, type MonthComparison, type MonthScore, type ScoreFactor } from '../lib/coach';
import { formatMonth, today } from '../lib/dates';
import { formatEuros } from '../lib/money';
import { easeOutCubic, prefersReducedMotion } from '../lib/motion';
import { SectionHeader, type ViewProps } from './common';
import { Icon, type IconName } from './icons';

/** Tu coach: nota del mes con consejos, colchón de emergencia y comparación con tu mes normal. */
export default function PersonalCoach({ data, month }: ViewProps & { month: string }) {
  const todayIso = today();
  const score = useMemo(
    () => monthScore({ entries: data.personal, recurring: data.personalRecurring, budgets: data.personalBudgets, month, todayIso }),
    [data.personal, data.personalRecurring, data.personalBudgets, month, todayIso],
  );
  const cushion = useMemo(() => emergencyCushion(data.personal, month), [data.personal, month]);
  const comparison = useMemo(() => compareWithNormal(data.personal, month, todayIso), [data.personal, month, todayIso]);

  if (data.personal.length === 0) return null;

  return (
    <section className="section" aria-labelledby="personal-coach">
      <SectionHeader id="personal-coach" title="Tu coach" />
      <ScoreCard score={score} />
      <CushionCard cushion={cushion} month={month} />
      <CompareCard comparison={comparison} />
    </section>
  );
}

/* ───────────── Nota del mes ───────────── */

const LEVEL_TEXT: Record<MonthScore['level'], string> = {
  genial: '¡Vas genial!',
  bien: 'Vas bien',
  regular: 'Se puede mejorar',
  flojo: 'Toca apretar',
};
const FACTOR_ICON: Record<ScoreFactor['key'], IconName> = { saving: 'piggy', fixed: 'repeat', limits: 'target', cushion: 'heart' };

function ScoreCard({ score }: { score: MonthScore | 'no-income' | 'too-early' }) {
  if (typeof score === 'string') {
    return (
      <div className="card coach-card coach-empty">
        <span className="coach-badge"><Icon name="sparkles" size={20} /></span>
        <p className="small">
          {score === 'too-early'
            ? `Tu nota del mes sale a partir del día ${SCORE_FROM_DAY}, cuando ya hay movimientos para juzgar.`
            : 'Apunta tus ingresos del mes (por ejemplo, la nómina) y te pongo nota, con consejos para mejorarla.'}
        </p>
      </div>
    );
  }
  return (
    <div className={'card coach-card level-' + score.level}>
      <div className="coach-head">
        <ScoreRing value={score.score} level={score.level} />
        <div className="coach-verdict">
          <span className="coach-kicker"><Icon name="sparkles" size={14} /> Nota del mes{score.provisional ? ' · provisional' : ''}</span>
          <strong>{LEVEL_TEXT[score.level]}</strong>
          <span className="muted small">
            {score.provisional ? 'Calculada como si siguieras al ritmo de hoy hasta fin de mes.' : 'Con todo lo que apuntaste ese mes.'}
          </span>
        </div>
      </div>
      <ul className="coach-factors" aria-label="De dónde sale la nota">
        {score.factors.map((f) => (
          <li key={f.key} title={`${f.points} de ${f.max} puntos`}>
            <span className="coach-factor-top"><Icon name={FACTOR_ICON[f.key]} size={14} /> {f.label}</span>
            <strong>{f.value}</strong>
            <span className="coach-meter" aria-hidden><span style={{ width: `${(f.points / f.max) * 100}%` }} /></span>
          </li>
        ))}
      </ul>
      <ol className="coach-tips" aria-label="Consejos">
        {score.tips.map((tip, i) => (
          <li key={i} style={{ animationDelay: `${300 + i * 120}ms` }}>
            <span className="coach-tip-n">{i + 1}</span>
            <span>{tip}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

function useCountTo(target: number, ms = 900) {
  const [shown, setShown] = useState(() => (prefersReducedMotion() ? target : 0));
  const from = useRef(shown);
  from.current = shown;
  useEffect(() => {
    if (prefersReducedMotion() || typeof requestAnimationFrame === 'undefined') {
      setShown(target);
      return;
    }
    const start = performance.now();
    const origin = from.current;
    let frame = 0;
    const step = (now: number) => {
      const t = (now - start) / ms;
      setShown(Math.round(origin + (target - origin) * easeOutCubic(t)));
      if (t < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [target, ms]);
  return shown;
}

function ScoreRing({ value, level }: { value: number; level: MonthScore['level'] }) {
  const id = useId();
  const shown = useCountTo(value);
  const R = 52;
  const C = 2 * Math.PI * R;
  return (
    <div className="score-ring" role="img" aria-label={`Nota del mes: ${value} de 100`}>
      <svg viewBox="0 0 128 128" aria-hidden>
        <defs>
          <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" className={'ring-a ' + level} />
            <stop offset="100%" className={'ring-b ' + level} />
          </linearGradient>
        </defs>
        <circle className="ring-track" cx="64" cy="64" r={R} />
        <circle
          className="ring-value"
          cx="64"
          cy="64"
          r={R}
          stroke={`url(#${id})`}
          strokeDasharray={C}
          strokeDashoffset={C * (1 - shown / 100)}
        />
      </svg>
      <span className="score-num">{shown}<small>/100</small></span>
    </div>
  );
}

/* ───────────── Colchón de emergencia ───────────── */

function CushionCard({ cushion, month }: { cushion: ReturnType<typeof emergencyCushion>; month: string }) {
  if (cushion.months == null) {
    return (
      <div className="card coach-mini">
        <p className="coach-mini-title"><Icon name="heart" size={16} /> Colchón de emergencia</p>
        <p className="muted small">Cuando tengas un mes completo apuntado, calcularé cuántos meses aguantarías sin ingresos con lo que te va sobrando.</p>
      </div>
    );
  }
  const months = cushion.months;
  const pct = Math.min(months / CUSHION_GOAL, 1) * 100;
  const tone = months >= CUSHION_GOAL ? 'goal' : months >= CUSHION_MIN ? 'ok' : 'low';
  return (
    <div className={'card coach-mini cushion-' + tone}>
      <p className="coach-mini-title"><Icon name="heart" size={16} /> Colchón de emergencia</p>
      <p className="cushion-big">{months >= CUSHION_GOAL * 2 ? `Más de ${CUSHION_GOAL * 2} meses` : formatMonths(months)}</p>
      <p className="small">
        {tone === 'goal'
          ? '¡Objetivo cumplido! Podrías vivir más de medio año sin ingresos.'
          : tone === 'ok'
            ? `Ya tienes lo mínimo recomendado. El ideal son ${CUSHION_GOAL} meses.`
            : `Lo recomendable es tener entre ${CUSHION_MIN} y ${CUSHION_GOAL} meses de gastos guardados.`}
      </p>
      <div className="cushion-track" role="progressbar" aria-label="Meses de colchón" aria-valuemin={0} aria-valuemax={CUSHION_GOAL} aria-valuenow={Math.round(months * 10) / 10}>
        <span className="cushion-fill" style={{ width: `${pct}%` }} />
        <span className="cushion-mark" style={{ left: `${(CUSHION_MIN / CUSHION_GOAL) * 100}%` }} />
      </div>
      <div className="cushion-scale" aria-hidden><span>0</span><span style={{ left: `${(CUSHION_MIN / CUSHION_GOAL) * 100}%` }}>{CUSHION_MIN} meses</span><span>{CUSHION_GOAL}</span></div>
      <p className="muted small">
        {cushion.savedCents > 0 ? <>Te han sobrado <strong>{formatEuros(cushion.savedCents)}</strong></> : <>No te ha sobrado dinero</>}
        {cushion.sinceMonth && ` desde ${formatMonth(cushion.sinceMonth).toLowerCase()} hasta antes de ${formatMonth(month).toLowerCase()}`}, y gastas unos {formatEuros(cushion.monthlyCents)} al mes.
        {cushion.toMinPerMonthCents > 0 && <> Apartando <strong>{formatEuros(cushion.toMinPerMonthCents)}</strong> al mes, en un año llegarías a {CUSHION_MIN} meses.</>}
      </p>
      {cushion.monthsCounted < 3 && <p className="muted small">Con solo {cushion.monthsCounted} {cushion.monthsCounted === 1 ? 'mes apuntado' : 'meses apuntados'} es una primera idea: será más fiable con más historial.</p>}
    </div>
  );
}

/* ───────────── Comparar con tu mes normal ───────────── */

function CompareCard({ comparison: c }: { comparison: MonthComparison | null }) {
  if (!c) {
    return (
      <div className="card coach-mini">
        <p className="coach-mini-title"><Icon name="chart" size={16} /> Comparado con tu mes normal</p>
        <p className="muted small">Con dos meses de movimientos apuntados podré decirte si gastas más o menos de lo normal.</p>
      </div>
    );
  }
  const less = c.diffCents < 0;
  const same = c.normalCents > 0 ? Math.abs(c.diffCents) / c.normalCents < 0.03 : c.diffCents === 0;
  const max = Math.max(c.currentCents, c.normalCents, c.lastYearCents ?? 0, 1);
  const when = c.upToDay ? `a día ${c.upToDay}` : 'en todo el mes';
  return (
    <div className="card coach-mini">
      <p className="coach-mini-title"><Icon name="chart" size={16} /> Comparado con tu mes normal</p>
      <p className={'compare-big ' + (same ? '' : less ? 'positive' : 'negative')}>
        {!same && <Icon name={less ? 'arrowDown' : 'arrowUp'} size={22} />}
        {same ? 'Como siempre' : `${formatEuros(Math.abs(c.diffCents))} ${less ? 'menos' : 'más'}`}
      </p>
      <p className="small">
        {same ? 'Gastas lo mismo que sueles' : less ? 'Gastas menos de lo que sueles' : 'Gastas más de lo que sueles'} {when}
        {c.upToDay ? ' (comparado con lo que solías llevar a estas alturas)' : ''}.
      </p>
      <div className="compare-bars">
        <CompareBar label="Este mes" cents={c.currentCents} max={max} kind="now" />
        <CompareBar label={`Tu mes normal (${c.monthsUsed} meses)`} cents={c.normalCents} max={max} kind="normal" />
        {c.lastYearCents != null && <CompareBar label="Hace un año" cents={c.lastYearCents} max={max} kind="year" />}
      </div>
      {c.categories.length > 0 && (
        <ul className="compare-cats" aria-label="Lo que más cambia">
          {c.categories.map((x) => (
            <li key={x.category}>
              <span>{x.category}</span>
              <strong className={x.diffCents > 0 ? 'negative' : 'positive'}>{x.diffCents > 0 ? '+' : '−'}{formatEuros(Math.abs(x.diffCents))}</strong>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function CompareBar({ label, cents, max, kind }: { label: string; cents: number; max: number; kind: 'now' | 'normal' | 'year' }) {
  return (
    <div className={'compare-bar ' + kind}>
      <span className="compare-label"><span>{label}</span><strong>{formatEuros(cents)}</strong></span>
      <span className="compare-track" aria-hidden><span style={{ width: `${(cents / max) * 100}%` }} /></span>
    </div>
  );
}

