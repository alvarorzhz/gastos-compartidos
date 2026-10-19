import { useMemo } from 'react';
import { formatShortDay, today } from '../lib/dates';
import { formatEuros } from '../lib/money';
import { personalReview, simulateSavings, type AlertKind, type Period, type PersonalAlert, type PersonalReview as Review } from '../lib/personalReview';
import type { PersonalEntry, PersonalRecurring } from '../lib/types';
import { CategoryIcon, EmptyState, Notice, Segmented, Sheet, useSticky } from './common';
import { Icon, type IconName } from './icons';

type Tab = 'payments' | 'alerts' | 'habits';

const PERIOD_TEXT: Record<Period, string> = { weekly: 'Cada semana', monthly: 'Cada mes', quarterly: 'Cada 3 meses', yearly: 'Cada año' };
const ALERT_LABEL: Record<AlertKind, { title: string; icon: IconName }> = {
  duplicate: { title: 'Cobro duplicado', icon: 'swap' },
  annual: { title: 'Se renueva solo cada año', icon: 'calendar' },
  trial: { title: 'Prueba que pasa a ser de pago', icon: 'clock' },
  fee: { title: 'Comisión del banco', icon: 'bank' },
};

export function usePersonalReview(entries: PersonalEntry[], recurring: PersonalRecurring[]): Review {
  return useMemo(() => personalReview(entries, recurring, today()), [entries, recurring]);
}

/** Resumen de una línea en Personal; al tocarlo se abre el repaso completo. */
export function PersonalReviewCard({ review, onOpen }: { review: Review; onOpen: () => void }) {
  const { payments, habits, alerts } = review;
  if (payments.length + habits.length + alerts.length === 0) return null;
  const parts = [
    review.monthlyCents > 0 && `${formatEuros(review.monthlyCents)}/mes en pagos`,
    review.habitsYearlyCents > 0 && `${formatEuros(review.habitsYearlyCents)}/año en gastos hormiga`,
  ].filter(Boolean);
  if (parts.length === 0) parts.push('Suscripciones, avisos y gastos hormiga');
  return (
    <ul className="list with-icons" aria-label="Repaso de tus gastos">
      <li>
      <button className="row-item" onClick={onOpen}>
        <span className="cat-icon cat-icon-md tone-1" aria-hidden><Icon name="sparkles" /></span>
        <span className="row-main">
          <span className="row-title">Lo que se repite</span>
          <span className="row-meta">{parts.join(' · ')}</span>
        </span>
        {alerts.length > 0 && <span className="tag tag-warn">{alerts.length} {alerts.length === 1 ? 'aviso' : 'avisos'}</span>}
        <Icon name="chevronRight" className="row-chevron" />
      </button>
      </li>
    </ul>
  );
}

export default function PersonalReviewSheet({ review, onClose }: { review: Review; onClose: () => void }) {
  const [tab, setTab] = useSticky<Tab>('personal.repaso.tab', 'payments');
  const [selected, setSelected] = useSticky<string[]>('personal.repaso.cancelar', []);
  const chosen = new Set(selected);
  const saving = simulateSavings(review, chosen);
  const toggle = (key: string) => setSelected(chosen.has(key) ? selected.filter((k) => k !== key) : [...selected, key]);

  return (
    <Sheet
      title="Lo que se repite"
      subtitle="Con lo que tienes apuntado en Personal. Solo lo ves tú."
      onClose={onClose}
      footer={
        tab === 'alerts' ? undefined : selected.length === 0 ? (
          <p className="field-hint">Marca lo que cancelarías y te digo cuánto ahorras.</p>
        ) : (
          <div className="stack" aria-live="polite">
            <div className="stat-grid">
              <div className="stat-tile"><span className="stat-label">Ahorrarías al mes</span><strong className="positive">{formatEuros(saving.monthlyCents)}</strong></div>
              <div className="stat-tile"><span className="stat-label">Ahorrarías al año</span><strong className="positive">{formatEuros(saving.yearlyCents)}</strong></div>
            </div>
            <button type="button" className="secondary" onClick={() => setSelected([])}>Desmarcar todo</button>
          </div>
        )
      }
    >
      <div className="stack">
        <Segmented
          legend="Ver"
          hideLegend
          size="sm"
          value={tab}
          options={[
            { value: 'payments', label: `Pagos (${review.payments.length})` },
            { value: 'alerts', label: `Avisos (${review.alerts.length})` },
            { value: 'habits', label: `Hormiga (${review.habits.length})` },
          ]}
          onChange={setTab}
        />
        {tab === 'payments' && <Payments review={review} chosen={chosen} toggle={toggle} />}
        {tab === 'alerts' && <Alerts alerts={review.alerts} />}
        {tab === 'habits' && <Habits review={review} chosen={chosen} toggle={toggle} />}
      </div>
    </Sheet>
  );
}

function ReviewTag({ reason }: { reason: string | null }) {
  if (!reason) return null;
  return <span className="tag tag-warn" title={reason}>Revisar</span>;
}

function Payments({ review, chosen, toggle }: { review: Review; chosen: Set<string>; toggle: (k: string) => void }) {
  if (review.payments.length === 0) {
    return <EmptyState icon="repeat" title="Nada que se repita todavía" text="Cuando un mismo pago salga varias veces (por ejemplo al importar el extracto del banco), aparecerá aquí." />;
  }
  return (
    <>
      <div className="stat-grid">
        <div className="stat-tile"><span className="stat-label">Total al mes</span><strong className="negative">{formatEuros(review.monthlyCents)}</strong></div>
        <div className="stat-tile"><span className="stat-label">Total al año</span><strong className="negative">{formatEuros(review.yearlyCents)}</strong></div>
      </div>
      <p className="field-hint">
        Al mes, según la media de los últimos cobros. El total no cuenta lo que está para revisar
        {review.reviewMonthlyCents > 0 && <> (serían {formatEuros(review.reviewMonthlyCents)} más al mes)</>}.
      </p>
      <ul className="list with-icons review-list">
        {review.payments.map((p) => (
          <li key={p.key}>
            <label className="row-item">
              {p.monthlyCents != null
                ? <input type="checkbox" className="cancel-check" checked={chosen.has(p.key)} onChange={() => toggle(p.key)} aria-label={`Cancelaría ${p.name}`} />
                : <span className="cancel-check" aria-hidden />}
              <CategoryIcon name={p.category} />
              <span className="row-main">
                <span className="row-title">{p.name}</span>
                <span className="row-meta">
                  {p.period ? PERIOD_TEXT[p.period] : 'Una vez'} · {p.fixed ? 'tu gasto fijo' : `${p.count} ${p.count === 1 ? 'cobro' : 'cobros'}, último ${formatShortDay(p.lastOn)}`}
                </span>
                {p.review && <span className="row-meta review-reason">{p.review}</span>}
              </span>
              <span className="row-end">
                {p.monthlyCents != null ? (
                  <>
                    <span className="row-amount">{formatEuros(p.monthlyCents)}<span className="muted small"> /mes</span></span>
                    <span className="row-sub muted">{formatEuros(p.yearlyCents!)} /año</span>
                  </>
                ) : (
                  <span className="row-amount">{formatEuros(p.lastCents)}</span>
                )}
                <ReviewTag reason={p.review} />
              </span>
            </label>
          </li>
        ))}
      </ul>
    </>
  );
}

function Alerts({ alerts }: { alerts: PersonalAlert[] }) {
  if (alerts.length === 0) {
    return <EmptyState icon="check" title="Sin avisos" text="No hay cobros duplicados, renovaciones anuales, pruebas que pasen a ser de pago ni comisiones del banco en lo apuntado." />;
  }
  return (
    <>
      <Notice icon="info">Lo marcado «Revisar» es una sospecha: compruébalo en el banco antes de reclamar o cancelar.</Notice>
      <ul className="list with-icons review-list">
        {alerts.map((a) => (
          <li key={a.key}>
            <div className="row-item">
              <span className="cat-icon cat-icon-md tone-4" aria-hidden><Icon name={ALERT_LABEL[a.kind].icon} /></span>
              <span className="row-main">
                <span className="row-title">{a.name}</span>
                <span className="row-meta"><strong>{ALERT_LABEL[a.kind].title}.</strong> {a.text}</span>
              </span>
              <span className="row-end">
                <span className="row-amount">{formatEuros(a.amountCents)}</span>
                <span className="row-sub muted">{a.kind === 'annual' ? 'renueva ' : ''}{formatShortDay(a.date)}</span>
                {a.review && <span className="tag tag-warn">Revisar</span>}
              </span>
            </div>
          </li>
        ))}
      </ul>
    </>
  );
}

function Habits({ review, chosen, toggle }: { review: Review; chosen: Set<string>; toggle: (k: string) => void }) {
  if (review.habits.length === 0) {
    return <EmptyState icon="coffee" title="Sin gastos hormiga" text="Aquí salen los gastos pequeños (hasta 10 €) que se repiten al menos dos veces al mes, como el café o el kiosco." />;
  }
  return (
    <>
      <div className="stat-grid">
        <div className="stat-tile"><span className="stat-label">Suman al año</span><strong className="negative">{formatEuros(review.habitsYearlyCents)}</strong></div>
        <div className="stat-tile"><span className="stat-label">Al mes</span><strong>{formatEuros(Math.round(review.habitsYearlyCents / 12))}</strong></div>
      </div>
      <p className="field-hint">
        {review.days >= 365 ? 'Con lo apuntado en el último año.' : `Con ${review.days} días de datos, calculado a este ritmo para un año.`}
      </p>
      <ul className="list with-icons review-list">
        {review.habits.map((h) => (
          <li key={h.key}>
            <label className="row-item">
              <input type="checkbox" className="cancel-check" checked={chosen.has(h.key)} onChange={() => toggle(h.key)} aria-label={`Dejaría ${h.name}`} />
              <CategoryIcon name={h.category} />
              <span className="row-main">
                <span className="row-title">{h.name}</span>
                <span className="row-meta">
                  {h.count} veces, {formatEuros(h.averageCents)} de media · {formatEuros(h.totalCents)} en total
                </span>
                {h.review && <span className="row-meta review-reason">{h.review}</span>}
              </span>
              <span className="row-end">
                <span className="row-amount">{formatEuros(h.yearlyCents)}<span className="muted small"> /año</span></span>
                <span className="row-sub muted">{formatEuros(h.monthlyCents)} /mes</span>
                <ReviewTag reason={h.review} />
              </span>
            </label>
          </li>
        ))}
      </ul>
    </>
  );
}
