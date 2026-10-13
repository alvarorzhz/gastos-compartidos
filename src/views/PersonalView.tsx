import { useState, type FormEvent } from 'react';
import { formatDay, monthOf, today } from '../lib/dates';
import { centsToInput, formatEuros, parseEuros } from '../lib/money';
import { categoryOptions, myCommonShare, personalByCategory, personalMonth } from '../lib/personal';
import { errorMessage, supabase } from '../lib/supabase';
import type { PersonalEntry } from '../lib/types';
import { MonthNav, Sheet, type ViewProps } from './common';

export default function PersonalView(props: ViewProps) {
  const { data, me } = props;
  const [month, setMonth] = useState(monthOf(today()));
  const [editing, setEditing] = useState<PersonalEntry | 'expense' | 'income' | null>(null);

  const sum = personalMonth(data.personal, month);
  const common = myCommonShare(me, data.expenses, month);
  const entries = data.personal.filter((e) => monthOf(e.entry_on) === month);
  const byCategory = personalByCategory(data.personal, month);

  return (
    <>
      <p className="muted small center">🔒 Solo tú ves esta pestaña. No cuenta en los gastos comunes.</p>
      <MonthNav month={month} onChange={setMonth} />

      <section className="card">
        <dl className="kv">
          <dt>Ingresos</dt>
          <dd className="positive">{formatEuros(sum.incomeCents)}</dd>
          <dt>Gastos personales</dt>
          <dd className="negative">−{formatEuros(sum.expenseCents)}</dd>
          <dt><strong>Te queda</strong></dt>
          <dd className={sum.netCents < 0 ? 'negative' : ''}>{formatEuros(sum.netCents)}</dd>
        </dl>
        {common > 0 && (
          <p className="muted small">
            Tu parte de los gastos comunes este mes es {formatEuros(common)}. Contándola, te quedarían{' '}
            <strong className={sum.netCents - common < 0 ? 'negative' : ''}>{formatEuros(sum.netCents - common)}</strong>.
          </p>
        )}
        <div className="row">
          <button className="secondary grow" onClick={() => setEditing('income')}>＋ Ingreso</button>
          <button className="secondary grow" onClick={() => setEditing('expense')}>＋ Gasto</button>
        </div>
      </section>

      {byCategory.length > 0 && (
        <section className="card">
          <h3>En qué has gastado</h3>
          <ul className="hbars">
            {byCategory.map((s) => (
              <li key={s.id}>
                <div className="row spread small">
                  <span>{s.id}</span>
                  <span>{formatEuros(s.cents)} <span className="muted">· {Math.round(s.share * 100)} %</span></span>
                </div>
                <div className="hbar"><div style={{ width: `${(s.cents / byCategory[0].cents) * 100}%` }} /></div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {entries.length === 0 ? (
        <p className="empty">No has apuntado nada personal este mes.</p>
      ) : (
        <ul className="list">
          {entries.map((e) => (
            <li key={e.id}>
              <button className="list-item" onClick={() => setEditing(e)}>
                <div className="grow">
                  <div className="title">{e.note || e.category}</div>
                  <div className="muted small">{formatDay(e.entry_on)} · {e.category}</div>
                </div>
                <div className={'amounts title ' + (e.kind === 'income' ? 'positive' : '')}>
                  {e.kind === 'income' ? '+' : '−'}{formatEuros(e.amount_cents)}
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}

      {editing && (
        <PersonalForm
          {...props}
          entry={typeof editing === 'string' ? null : editing}
          kind={typeof editing === 'string' ? editing : editing.kind}
          onClose={() => setEditing(null)}
        />
      )}
    </>
  );
}

function PersonalForm({ data, reload, entry, kind: initialKind, onClose }: ViewProps & {
  entry: PersonalEntry | null;
  kind: PersonalEntry['kind'];
  onClose: () => void;
}) {
  const [kind, setKind] = useState(initialKind);
  const [amount, setAmount] = useState(entry ? centsToInput(entry.amount_cents) : '');
  const [category, setCategory] = useState(entry?.category ?? '');
  const [date, setDate] = useState(entry?.entry_on ?? today());
  const [note, setNote] = useState(entry?.note ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const options = categoryOptions(data.personal, kind);

  async function save(e: FormEvent) {
    e.preventDefault();
    const cents = parseEuros(amount);
    if (cents == null) return setError('Escribe un importe válido, por ejemplo 12,50');
    const cat = category.trim() || options[options.length - 1];
    setBusy(true);
    setError(null);
    const fields = { kind, amount_cents: cents, category: cat.slice(0, 40), entry_on: date, note: note.trim() || null };
    const { error } = entry
      ? await supabase.from('personal_entries').update(fields).eq('id', entry.id)
      : await supabase.from('personal_entries').insert(fields);
    setBusy(false);
    if (error) return setError(errorMessage(error));
    await reload();
    onClose();
  }

  async function remove() {
    if (!entry || !confirm('¿Borrar este movimiento?')) return;
    setBusy(true);
    const { error } = await supabase.from('personal_entries').delete().eq('id', entry.id);
    setBusy(false);
    if (error) return setError(errorMessage(error));
    await reload();
    onClose();
  }

  return (
    <Sheet title={entry ? 'Editar movimiento personal' : kind === 'income' ? 'Nuevo ingreso' : 'Nuevo gasto personal'} onClose={onClose}>
      <form onSubmit={save} className="stack">
        <fieldset className="segmented">
          <legend>Tipo</legend>
          {(['income', 'expense'] as const).map((k) => (
            <label key={k} className={kind === k ? 'selected' : ''}>
              <input type="radio" name="kind" checked={kind === k} onChange={() => { setKind(k); setCategory(''); }} />
              {k === 'income' ? 'Ingreso' : 'Gasto'}
            </label>
          ))}
        </fieldset>
        <label>
          Importe (€)
          <input className="amount-input" inputMode="decimal" autoFocus={!entry} required placeholder="0,00" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </label>
        <label>
          Categoría
          <input list="personal-categories" maxLength={40} value={category} onChange={(e) => setCategory(e.target.value)} placeholder={options[0]} />
          <datalist id="personal-categories">
            {options.map((o) => <option key={o} value={o} />)}
          </datalist>
        </label>
        <div className="chips-row">
          {options.slice(0, 6).map((o) => (
            <button type="button" key={o} className={'chip-btn ' + (category === o ? 'primary' : 'secondary')} onClick={() => setCategory(o)}>{o}</button>
          ))}
        </div>
        <label>
          Fecha
          <input type="date" required value={date} onChange={(e) => setDate(e.target.value)} />
        </label>
        <label>
          Nota (opcional)
          <input maxLength={200} value={note} onChange={(e) => setNote(e.target.value)} />
        </label>
        {error && <p className="error">{error}</p>}
        <div className="row">
          {entry && <button type="button" className="danger" onClick={remove} disabled={busy}>Borrar</button>}
          <button className="primary grow" disabled={busy}>{busy ? 'Guardando…' : 'Guardar'}</button>
        </div>
      </form>
    </Sheet>
  );
}
