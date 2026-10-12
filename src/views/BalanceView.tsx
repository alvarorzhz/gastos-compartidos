import { useState, type FormEvent } from 'react';
import { balanceFor, totalPaidBy } from '../lib/balance';
import { formatDay, today } from '../lib/dates';
import { centsToInput, formatEuros, parseEuros } from '../lib/money';
import { nameOf, partnerOf } from '../lib/people';
import { errorMessage, supabase } from '../lib/supabase';
import { Sheet, type ViewProps } from './common';
import { BalanceText } from './ExpensesView';

export default function BalanceView(props: ViewProps) {
  const { data, me, reload } = props;
  const partner = partnerOf(data.members, me);
  const [settling, setSettling] = useState(false);

  if (!partner) {
    return <p className="empty">El saldo aparecerá cuando tu pareja se una al espacio. Invítala desde Ajustes.</p>;
  }

  const balance = balanceFor(me, data.expenses, data.settlements);
  const total = data.expenses.reduce((t, e) => t + e.amount_cents, 0);

  async function removeSettlement(id: string) {
    if (!confirm('¿Borrar este reembolso? El saldo se recalculará.')) return;
    const { error } = await supabase.from('settlements').delete().eq('id', id);
    if (error) alert(errorMessage(error));
    await reload();
  }

  return (
    <>
      <section className="card big-balance">
        <BalanceText balance={balance} partnerName={partner.display_name} />
        {Math.round(balance) !== 0 && (
          <button className="primary" onClick={() => setSettling(true)}>Anotar reembolso</button>
        )}
      </section>

      <section className="card">
        <h3>Desde el principio</h3>
        <dl className="kv">
          <dt>Gasto compartido total</dt>
          <dd>{formatEuros(total)}</dd>
          <dt>Has pagado tú</dt>
          <dd>{formatEuros(totalPaidBy(me, data.expenses))}</dd>
          <dt>Ha pagado {partner.display_name}</dt>
          <dd>{formatEuros(totalPaidBy(partner.user_id, data.expenses))}</dd>
          <dt>A cada persona le toca</dt>
          <dd>{formatEuros(total / 2)}</dd>
        </dl>
        <p className="muted small">La app solo lleva la cuenta: los reembolsos los hacéis vosotros (Bizum, transferencia, efectivo…) y aquí se anotan.</p>
      </section>

      <h3>Reembolsos</h3>
      {data.settlements.length === 0 ? (
        <p className="empty">Todavía no habéis anotado ningún reembolso.</p>
      ) : (
        <ul className="list">
          {data.settlements.map((s) => {
            return (
              <li key={s.id} className="list-item static">
                <div className="grow">
                  <div className="title">
                    {nameOf(data.members, s.from_user, me)} → {s.to_user === me ? 'ti' : nameOf(data.members, s.to_user)}
                  </div>
                  <div className="muted small">{formatDay(s.paid_on)}{s.note ? ` · ${s.note}` : ''}</div>
                </div>
                <div className="amounts">
                  <div className="title">{formatEuros(s.amount_cents)}</div>
                  <button className="link small" onClick={() => removeSettlement(s.id)}>Borrar</button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {settling && <SettlementForm {...props} balance={balance} partnerId={partner.user_id} onClose={() => setSettling(false)} />}
    </>
  );
}

function SettlementForm({ data, me, reload, balance, partnerId, onClose }: ViewProps & { balance: number; partnerId: string; onClose: () => void }) {
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
    if (cents == null) return setError('Escribe un importe válido');
    setBusy(true);
    const { error } = await supabase.from('settlements').insert({
      household_id: data.household.id, amount_cents: cents, paid_on: date, from_user: from, to_user: to, note: note.trim() || null, created_by: me,
    });
    setBusy(false);
    if (error) return setError(errorMessage(error));
    await reload();
    onClose();
  }

  return (
    <Sheet title="Anotar reembolso" onClose={onClose}>
      <form onSubmit={save} className="stack">
        <fieldset className="segmented">
          <legend>¿Quién devuelve el dinero?</legend>
          {[me, partnerId].map((id) => (
            <label key={id} className={from === id ? 'selected' : ''}>
              <input type="radio" name="from" checked={from === id} onChange={() => setFrom(id)} />
              {nameOf(data.members, id, me)}
            </label>
          ))}
        </fieldset>
        <label>
          Importe (€)
          <input className="amount-input" inputMode="decimal" required value={amount} onChange={(e) => setAmount(e.target.value)} />
        </label>
        <label>
          Fecha
          <input type="date" required value={date} onChange={(e) => setDate(e.target.value)} />
        </label>
        <label>
          Nota (opcional)
          <input maxLength={200} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Ej.: Bizum" />
        </label>
        {error && <p className="error">{error}</p>}
        <button className="primary" disabled={busy}>Guardar reembolso</button>
      </form>
    </Sheet>
  );
}
