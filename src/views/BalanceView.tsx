import { useId, useState, type FormEvent } from 'react';
import { balanceFor, shareOf, totalPaidBy } from '../lib/balance';
import { formatDayHeading, today } from '../lib/dates';
import { centsToInput, formatEuros, parseEuros } from '../lib/money';
import { nameOf, partnerOf } from '../lib/people';
import { errorMessage, supabase } from '../lib/supabase';
import { AmountField, Avatar, confirmAction, EmptyState, SectionHeader, Segmented, Sheet, toast, type ViewProps  } from './common';
import { Icon } from './icons';

export function BalanceText({ balance, partnerName }: { balance: number; partnerName: string }) {
  const rounded = Math.round(balance);
  if (rounded === 0) return <span>Estáis en paz</span>;
  if (rounded > 0) {
    return <span>{partnerName} te debe <strong className="positive">{formatEuros(rounded)}</strong></span>;
  }
  return <span>Debes a {partnerName} <strong className="negative">{formatEuros(-rounded)}</strong></span>;
}

export default function BalanceView(props: ViewProps) {
  const { data, me, reload } = props;
  const partner = partnerOf(data.members, me);
  const [settling, setSettling] = useState(false);

  if (!partner) {
    return (
      <div className="card">
        <EmptyState
          icon="users"
          title="El saldo aparecerá cuando seáis dos"
          text="Invita a tu pareja desde Ajustes. Aquí veréis quién debe a quién y podréis anotar los reembolsos."
          action={<button className="primary" onClick={() => (location.hash = '#ajustes')}>Ir a Ajustes</button>}
        />
      </div>
    );
  }

  const balance = balanceFor(me, data.expenses, data.settlements);
  const rounded = Math.round(balance);
  const total = data.expenses.reduce((t, e) => t + e.amount_cents, 0);

  async function removeSettlement(id: string) {
    const ok = await confirmAction({ title: '¿Borrar este reembolso?', message: 'El saldo se recalculará.', confirmLabel: 'Borrar', danger: true });
    if (!ok) return;
    const { error } = await supabase.from('settlements').delete().eq('id', id);
    if (error) toast(errorMessage(error), 'error');
    else toast('Reembolso borrado');
    await reload();
  }

  return (
    <>
      <section className="card balance-hero" aria-label="Saldo entre los dos">
        <div className="balance-people" aria-hidden>
          <Avatar members={data.members} userId={rounded < 0 ? me : partner.user_id} size="lg" />
          <Icon name={rounded === 0 ? 'heart' : 'arrowRight'} size={22} />
          <Avatar members={data.members} userId={rounded < 0 ? partner.user_id : me} size="lg" />
        </div>
        <p className="balance-text">
          {rounded === 0 ? (
            <>Estáis en paz<strong>0,00 €</strong></>
          ) : rounded > 0 ? (
            <>{partner.display_name} te debe<strong className="positive">{formatEuros(rounded)}</strong></>
          ) : (
            <>Debes a {partner.display_name}<strong className="negative">{formatEuros(-rounded)}</strong></>
          )}
        </p>
        {rounded !== 0 && (
          <button className="primary" onClick={() => setSettling(true)}>
            <Icon name="check" size={18} /> Anotar reembolso
          </button>
        )}
        <p className="muted small">La app solo lleva la cuenta: los reembolsos los hacéis vosotros (Bizum, transferencia, efectivo…) y aquí se anotan.</p>
      </section>

      <section className="section" aria-labelledby="balance-history">
        <SectionHeader id="balance-history" title="Desde el principio" />
        <div className="card">
          <dl className="kv">
            <dt>Gasto compartido total</dt>
            <dd>{formatEuros(total)}</dd>
            <dt>Has pagado tú</dt>
            <dd>{formatEuros(totalPaidBy(me, data.expenses))}</dd>
            <dt>Ha pagado {partner.display_name}</dt>
            <dd>{formatEuros(totalPaidBy(partner.user_id, data.expenses))}</dd>
            <dt>Te toca a ti</dt>
            <dd>{formatEuros(shareOf(me, data.expenses))}</dd>
            <dt>Le toca a {partner.display_name}</dt>
            <dd>{formatEuros(shareOf(partner.user_id, data.expenses))}</dd>
          </dl>
        </div>
      </section>

      <section className="section" aria-labelledby="balance-settlements">
        <SectionHeader id="balance-settlements" title="Reembolsos" />
        {data.settlements.length === 0 ? (
          <div className="card">
            <EmptyState icon="swap" title="Sin reembolsos todavía" text="Cuando uno le devuelva dinero al otro, anotadlo aquí para dejar el saldo a cero." />
          </div>
        ) : (
          <ul className="list with-icons">
            {data.settlements.map((s) => (
              <li key={s.id} className="row-item">
                <Avatar members={data.members} userId={s.from_user} />
                <span className="row-main">
                  <span className="row-title">
                    {nameOf(data.members, s.from_user, me)} → {s.to_user === me ? 'ti' : nameOf(data.members, s.to_user)}
                  </span>
                  <span className="row-meta">{formatDayHeading(s.paid_on)}{s.note ? ` · ${s.note}` : ''}</span>
                </span>
                <span className="row-amount">{formatEuros(s.amount_cents)}</span>
                <button className="icon-btn danger-icon" onClick={() => removeSettlement(s.id)} aria-label={`Borrar reembolso de ${formatEuros(s.amount_cents)}`}>
                  <Icon name="trash" size={18} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {settling && <SettlementForm {...props} balance={balance} partnerId={partner.user_id} onClose={() => setSettling(false)} />}
    </>
  );
}

function SettlementForm({ data, me, reload, balance, partnerId, onClose }: ViewProps & { balance: number; partnerId: string; onClose: () => void }) {
  const formId = useId();
  // Por defecto, quien debe paga a quien le deben el saldo completo.
  const [from, setFrom] = useState(balance > 0 ? partnerId : me);
  const [amount, setAmount] = useState(centsToInput(Math.round(Math.abs(balance))));
  const [date, setDate] = useState(today());
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const to = from === me ? partnerId : me;

  async function save(e: FormEvent) {
    e.preventDefault();
    const cents = parseEuros(amount);
    if (cents == null) return setError('Escribe un importe válido, por ejemplo 25,00');
    if (!date) return setError('Elige una fecha');
    setBusy(true);
    const { error } = await supabase.from('settlements').insert({
      household_id: data.household.id, amount_cents: cents, paid_on: date, from_user: from, to_user: to, note: note.trim() || null, created_by: me,
    });
    setBusy(false);
    if (error) return setError(errorMessage(error));
    await reload();
    toast('Reembolso anotado');
    onClose();
  }

  return (
    <Sheet
      title="Anotar reembolso"
      onClose={onClose}
      footer={
        <>
          {error && <p className="error" role="alert">{error}</p>}
          <button type="submit" form={formId} className="primary lg block" disabled={busy}>{busy ? 'Guardando…' : 'Guardar reembolso'}</button>
        </>
      }
    >
      <form id={formId} onSubmit={save} className="stack" noValidate>
        <AmountField label="Importe" value={amount} onChange={setAmount} />
        <Segmented
          legend="¿Quién devuelve el dinero?"
          value={from}
          options={[me, partnerId].map((id) => ({ value: id, label: <><Avatar members={data.members} userId={id} size="sm" />{nameOf(data.members, id, me)}</> }))}
          onChange={setFrom}
        />
        <div className="field">
          <label className="field-label" htmlFor={formId + '-date'}>Fecha</label>
          <input id={formId + '-date'} type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <div className="field">
          <label className="field-label" htmlFor={formId + '-note'}>Nota <span className="faint">(opcional)</span></label>
          <input id={formId + '-note'} maxLength={200} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Ej.: Bizum" />
        </div>
      </form>
    </Sheet>
  );
}
