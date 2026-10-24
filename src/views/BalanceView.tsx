import { useId, useState, type FormEvent } from 'react';
import { balanceFor, roundBalance, shareOf, totalPaidBy } from '../lib/balance';
import { formatDayHeading, today } from '../lib/dates';
import { centsToInput, formatEuros, parseEuros } from '../lib/money';
import { nameOf, partnerOf } from '../lib/people';
import { errorMessage, supabase } from '../lib/supabase';
import { AmountField, Avatar, celebrate, EmptyState, SectionHeader, Segmented, Sheet, toast, type ViewProps  } from './common';
import { Icon } from './icons';
import { deleteWithUndo } from './undo';

/** Saldo sin tono de deuda: "Para quedar en paz, Marta te pasa 24,00 €". */
export function BalanceText({ balance, partnerName }: { balance: number; partnerName: string }) {
  const rounded = roundBalance(balance);
  if (rounded === 0) return <span>Estáis en paz 🤍</span>;
  if (rounded > 0) {
    return <span>Para quedar en paz, {partnerName} te pasa <strong>{formatEuros(rounded)}</strong></span>;
  }
  return <span>Para quedar en paz, le pasas a {partnerName} <strong>{formatEuros(-rounded)}</strong></span>;
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
          text="Invita a tu pareja desde Ajustes. Aquí veréis cuánto le pasa uno al otro para quedar en paz."
          action={<button className="primary" onClick={() => (location.hash = '#ajustes')}>Ir a Ajustes</button>}
        />
      </div>
    );
  }

  const balance = balanceFor(me, data.expenses, data.settlements);
  const rounded = roundBalance(balance);
  const total = data.expenses.reduce((t, e) => t + e.amount_cents, 0);

  function removeSettlement(id: string) {
    deleteWithUndo({ table: 'settlements', id, done: 'Pago borrado', reload });
  }

  return (
    <>
      <section className={'card balance-hero' + (rounded === 0 ? ' balance-even' : '')} aria-label="Saldo entre los dos">
        <div className="balance-people" aria-hidden>
          <Avatar members={data.members} userId={rounded < 0 ? me : partner.user_id} size="lg" />
          {rounded === 0 ? (
            <span className="balance-flow"><span className="balance-heart">🤍</span></span>
          ) : (
            <span className="balance-flow"><Icon name="arrowRight" size={22} />le pasa</span>
          )}
          <Avatar members={data.members} userId={rounded < 0 ? partner.user_id : me} size="lg" />
        </div>
        <p className="balance-text">
          {rounded === 0 ? (
            <>Estáis en paz<strong>0,00 €</strong></>
          ) : (
            <>
              <span className="balance-kicker">Para quedar en paz</span>
              {rounded > 0 ? <>{partner.display_name} te pasa</> : <>Le pasas a {partner.display_name}</>}
              <strong>{formatEuros(Math.abs(rounded))}</strong>
            </>
          )}
        </p>
        {rounded !== 0 && (
          <button className="primary" onClick={() => setSettling(true)}>
            <span aria-hidden>🤝</span> Ya nos lo hemos pasado
          </button>
        )}
        <p className="muted small">
          {rounded === 0
            ? 'Ninguno le debe nada al otro. Seguid apuntando y aquí veréis cuándo toca volver a equilibrar.'
            : 'Cuando os paséis el dinero (Bizum, transferencia, efectivo…), anotadlo con el botón y la cuenta vuelve a cero.'}
        </p>
      </section>

      <section className="section" aria-labelledby="balance-history">
        <SectionHeader id="balance-history" title="Desde el principio" />
        <div className="card">
          <dl className="kv">
            <dt>Lo que habéis compartido</dt>
            <dd>{formatEuros(total)}</dd>
            <dt>Has puesto tú</dt>
            <dd>{formatEuros(totalPaidBy(me, data.expenses))}</dd>
            <dt>Ha puesto {partner.display_name}</dt>
            <dd>{formatEuros(totalPaidBy(partner.user_id, data.expenses))}</dd>
            <dt>Te toca a ti</dt>
            <dd>{formatEuros(shareOf(me, data.expenses))}</dd>
            <dt>Le toca a {partner.display_name}</dt>
            <dd>{formatEuros(shareOf(partner.user_id, data.expenses))}</dd>
          </dl>
        </div>
      </section>

      <section className="section" aria-labelledby="balance-settlements">
        <SectionHeader id="balance-settlements" title="Lo que os habéis pasado" />
        {data.settlements.length === 0 ? (
          <div className="card">
            <EmptyState icon="swap" title="Todavía nada" text="Cuando uno le pase dinero al otro para quedar en paz, anotadlo aquí y el saldo vuelve a cero." />
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
                <button className="icon-btn danger-icon" onClick={() => removeSettlement(s.id)} aria-label={`Borrar pago de ${formatEuros(s.amount_cents)}`}>
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
  const [amount, setAmount] = useState(centsToInput(Math.abs(roundBalance(balance))));
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
    const after = roundBalance(balance + (from === me ? cents : -cents));
    if (after === 0) celebrate('¡Estáis en paz!');
    else toast('Pago anotado');
    onClose();
  }

  return (
    <Sheet
      title="Anotar lo que os habéis pasado"
      onClose={onClose}
      footer={
        <>
          {error && <p className="error" role="alert">{error}</p>}
          <button type="submit" form={formId} className="primary lg block" disabled={busy}>{busy ? 'Guardando…' : 'Guardar'}</button>
        </>
      }
    >
      <form id={formId} onSubmit={save} className="stack" noValidate>
        <AmountField label="Importe" value={amount} onChange={setAmount} />
        <Segmented
          legend="¿Quién le pasa el dinero al otro?"
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
