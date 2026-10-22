import { useEffect, useState } from 'react';
import { formatDayHeading, toIsoDate } from '../lib/dates';
import { formatEuros } from '../lib/money';
import { personalCategoryFor, prefillOf, takePaymentFromUrl, usePendingPayments, type PendingPayment } from '../lib/payments';
import { errorMessage } from '../lib/supabase';
import { Sheet, toast, type ViewProps } from './common';
import ExpenseForm from './ExpenseForm';
import { Icon } from './icons';
import { PersonalForm } from './PersonalView';

type Opening = { payment: PendingPayment; as: 'common' | 'personal' | 'ask' };

const amountText = (p: PendingPayment) => (p.amount_cents != null ? formatEuros(p.amount_cents) : p.raw_amount || 'Importe sin leer');

function whenText(p: PendingPayment) {
  const d = new Date(p.paid_at);
  return `${formatDayHeading(toIsoDate(d))} a las ${d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}`;
}

/**
 * Pagos con Apple Pay por confirmar: en Inicio, la lista con «Común», «Personal» o «No apuntar».
 * Al tocar el aviso del móvil se abre directamente el pago, preguntando cómo apuntarlo.
 */
export default function PendingPayments(props: ViewProps & { showList: boolean }) {
  const { data, me, showList } = props;
  const { payments, available, remove } = usePendingPayments(me);
  const [opening, setOpening] = useState<Opening | null>(null);
  const [wanted, setWanted] = useState(takePaymentFromUrl);
  const [loaded, setLoaded] = useState(false);

  // El aviso del móvil abre la app con el pago: se enseña en cuanto se ha cargado.
  useEffect(() => {
    const onFocus = () => {
      const id = takePaymentFromUrl();
      if (id) setWanted(id);
    };
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, []);
  useEffect(() => {
    if (available) setLoaded(true);
  }, [available, payments]);
  useEffect(() => {
    if (!wanted || !loaded) return;
    const p = payments.find((x) => x.id === wanted);
    setWanted(null);
    if (p) setOpening({ payment: p, as: 'ask' });
    else toast('Ese pago ya está apuntado o descartado', 'info');
  }, [wanted, loaded, payments]);

  async function discard(p: PendingPayment) {
    setOpening(null);
    const error = await remove(p.id);
    if (error) toast(errorMessage(error), 'error');
    else toast('Pago descartado', 'info');
  }

  const done = (p: PendingPayment) => () => void remove(p.id);
  const close = () => setOpening(null);

  return (
    <>
      {showList && payments.length > 0 && (
        <section className="card stack-sm pending-payments" aria-labelledby="pending-payments">
          <h2 id="pending-payments" className="row stat-label">
            <Icon name="card" size={16} /> {payments.length === 1 ? 'Un pago por confirmar' : `${payments.length} pagos por confirmar`}
          </h2>
          <p className="muted small">Han llegado de Apple Pay. Elige si son comunes o personales; no cuentan hasta que los apuntes.</p>
          <ul className="list with-icons">
            {payments.slice(0, 5).map((p) => (
              <li key={p.id}>
                <div className="row-item">
                  <span className="icon-tile accent"><Icon name="card" /></span>
                  <span className="row-main">
                    <span className="row-title">{p.merchant || 'Pago con Apple Pay'} · {amountText(p)}</span>
                    <span className="row-meta">{whenText(p)}{p.card ? ` · ${p.card}` : ''}</span>
                  </span>
                </div>
                <div className="row wrap" style={{ justifyContent: 'flex-end', paddingBottom: 'var(--s2)' }}>
                  <button className="sm secondary" onClick={() => void discard(p)}>No apuntar</button>
                  <button className="sm secondary" onClick={() => setOpening({ payment: p, as: 'personal' })}>
                    <Icon name="user" size={16} /> Personal
                  </button>
                  <button className="sm primary" onClick={() => setOpening({ payment: p, as: 'common' })}>
                    <Icon name="users" size={16} /> Común
                  </button>
                </div>
              </li>
            ))}
          </ul>
          {payments.length > 5 && <p className="muted small">Y {payments.length - 5} más: aparecerán al confirmar estos.</p>}
        </section>
      )}

      {opening?.as === 'ask' && (
        <Sheet title={amountText(opening.payment)} subtitle={`${opening.payment.merchant || 'Pago con Apple Pay'} · ${whenText(opening.payment)}`} onClose={close}>
          <div className="stack">
            <p className="muted">¿Cómo lo apuntas?</p>
            <button className="primary lg" onClick={() => setOpening({ ...opening, as: 'common' })}>
              <Icon name="users" size={18} /> Gasto común
            </button>
            <button className="secondary lg" onClick={() => setOpening({ ...opening, as: 'personal' })}>
              <Icon name="user" size={18} /> Gasto personal (solo lo ves tú)
            </button>
            <button className="secondary" onClick={() => void discard(opening.payment)}>No apuntar</button>
          </div>
        </Sheet>
      )}
      {opening?.as === 'common' && (
        <ExpenseForm {...props} expense={null} prefill={prefillOf(opening.payment)} onSaved={done(opening.payment)} onClose={close} />
      )}
      {opening?.as === 'personal' && (
        <PersonalForm
          {...props}
          entry={null}
          kind="expense"
          prefill={{ ...prefillOf(opening.payment), category: personalCategoryFor(opening.payment.merchant ?? '', data.personal) }}
          onSaved={done(opening.payment)}
          onClose={close}
        />
      )}
    </>
  );
}
