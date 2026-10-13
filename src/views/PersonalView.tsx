import { useState, type FormEvent } from 'react';
import { formatDay, monthOf, today } from '../lib/dates';
import { centsToInput, formatEuros, parseEuros } from '../lib/money';
import { categoryOptions, myCommonShare, personalByCategory, personalMonth } from '../lib/personal';
import { errorMessage, supabase } from '../lib/supabase';
import { FREQUENCIES, frequencyText, monthlyEquivalent, nextDate, recurringDate } from '../lib/recurring';
import type { Frequency, PersonalEntry, PersonalRecurring } from '../lib/types';
import { MonthNav, Sheet, type ViewProps } from './common';

export default function PersonalView(props: ViewProps) {
  const { data, me } = props;
  const [month, setMonth] = useState(monthOf(today()));
  const [editing, setEditing] = useState<PersonalEntry | 'expense' | 'income' | null>(null);
  const [template, setTemplate] = useState<PersonalRecurring | null>(null);
  const [showFixed, setShowFixed] = useState(false);

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

      <div className="row spread list-head">
        <span className="muted small">Movimientos del mes</span>
        <button className="link small" onClick={() => setShowFixed(true)}>🔁 Fijos ({data.personalRecurring.length})</button>
      </div>
      {entries.length === 0 ? (
        <p className="empty">No has apuntado nada personal este mes.</p>
      ) : (
        <ul className="list">
          {entries.map((e) => (
            <li key={e.id}>
              <button className="list-item" onClick={() => setEditing(e)}>
                <div className="grow">
                  <div className="title">{e.recurring_id && <span aria-label="Fijo">🔁 </span>}{e.note || e.category}</div>
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

      {showFixed && !template && (
        <Sheet title="Ingresos y gastos fijos" onClose={() => setShowFixed(false)}>
          <FixedList items={data.personalRecurring} onEdit={setTemplate} />
          <div className="row">
            <button className="secondary grow" onClick={() => { setShowFixed(false); setEditing('income'); }}>＋ Ingreso fijo</button>
            <button className="secondary grow" onClick={() => { setShowFixed(false); setEditing('expense'); }}>＋ Gasto fijo</button>
          </div>
          <p className="muted small">Al crear un ingreso o gasto, elige cada cuánto se repite y se apuntará solo.</p>
        </Sheet>
      )}
      {template && (
        <PersonalForm {...props} entry={null} template={template} kind={template.kind} onClose={() => setTemplate(null)} />
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

function FixedList({ items, onEdit }: { items: PersonalRecurring[]; onEdit: (r: PersonalRecurring) => void }) {
  if (items.length === 0) return <p className="empty">Todavía no tienes fijos. Por ejemplo: la nómina, el gimnasio o Netflix.</p>;
  const active = items.filter((r) => r.active);
  const income = active.filter((r) => r.kind === 'income').reduce((s, r) => s + monthlyEquivalent(r), 0);
  const expense = active.filter((r) => r.kind === 'expense').reduce((s, r) => s + monthlyEquivalent(r), 0);
  const sorted = [...items].sort((a, b) => Number(b.active) - Number(a.active) || nextDate(a).localeCompare(nextDate(b)));
  return (
    <div className="stack">
      <p className="small">Al mes, unos <strong className="positive">{formatEuros(income)}</strong> de ingresos fijos y <strong className="negative">{formatEuros(expense)}</strong> de gastos fijos.</p>
      <ul className="list">
        {sorted.map((r) => (
          <li key={r.id}>
            <button className={'list-item' + (r.active ? '' : ' paused')} onClick={() => onEdit(r)}>
              <div className="grow">
                <div className="title">{r.note || r.category}</div>
                <div className="muted small">
                  {r.active ? `${frequencyText(r.frequency)} · próximo ${formatDay(nextDate(r))}` : 'En pausa'} · {r.category}
                </div>
              </div>
              <div className={'amounts title ' + (r.kind === 'income' ? 'positive' : '')}>
                {r.kind === 'income' ? '+' : '−'}{formatEuros(r.amount_cents)}
              </div>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function PersonalForm({ data, reload, entry, template, kind: initialKind, onClose }: ViewProps & {
  entry: PersonalEntry | null;
  /** Si se pasa, se edita este fijo en vez de un movimiento. */
  template?: PersonalRecurring;
  kind: PersonalEntry['kind'];
  onClose: () => void;
}) {
  const source = template ?? entry;
  const initialDate = template ? nextDate(template) : entry?.entry_on ?? today();
  const [kind, setKind] = useState(initialKind);
  const [amount, setAmount] = useState(source ? centsToInput(source.amount_cents) : '');
  const [category, setCategory] = useState(source?.category ?? '');
  const [date, setDate] = useState(initialDate);
  const [note, setNote] = useState(source?.note ?? '');
  // '' = no se repite. Solo para movimientos nuevos y fijos.
  const [frequency, setFrequency] = useState<Frequency | ''>(template?.frequency ?? '');
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
    const base = { kind, amount_cents: cents, category: cat.slice(0, 40), note: note.trim() || null };
    let result;
    if (template) {
      const rescheduled = date !== initialDate || frequency !== template.frequency;
      if (rescheduled && date <= today()) {
        setBusy(false);
        return setError('La próxima vez tiene que ser una fecha a partir de mañana');
      }
      result = await supabase
        .from('personal_recurring')
        .update(rescheduled ? { ...base, frequency, start_on: date, generated_count: 0 } : base)
        .eq('id', template.id);
    } else if (!entry && frequency) {
      result = await supabase.from('personal_recurring').insert({ ...base, frequency, start_on: date });
    } else {
      const fields = { ...base, entry_on: date };
      result = entry
        ? await supabase.from('personal_entries').update(fields).eq('id', entry.id)
        : await supabase.from('personal_entries').insert(fields);
    }
    const { error } = result;
    setBusy(false);
    if (error) return setError(errorMessage(error));
    await reload();
    onClose();
  }

  async function toggleActive() {
    if (!template) return;
    const patch: Partial<PersonalRecurring> = { active: !template.active };
    if (!template.active) {
      // Al reanudar no se apuntan los periodos en pausa.
      let n = template.generated_count;
      while (recurringDate(template.start_on, template.frequency, n) < today()) n++;
      patch.generated_count = n;
    }
    setBusy(true);
    const { error } = await supabase.from('personal_recurring').update(patch).eq('id', template.id);
    setBusy(false);
    if (error) return setError(errorMessage(error));
    await reload();
    onClose();
  }

  async function remove() {
    const message = template ? '¿Borrar este fijo? Lo que ya se apuntó se queda.' : '¿Borrar este movimiento?';
    if (!source || !confirm(message)) return;
    setBusy(true);
    const { error } = template
      ? await supabase.from('personal_recurring').delete().eq('id', template.id)
      : await supabase.from('personal_entries').delete().eq('id', entry!.id);
    setBusy(false);
    if (error) return setError(errorMessage(error));
    await reload();
    onClose();
  }

  return (
    <Sheet
      title={template ? 'Editar fijo' : entry ? 'Editar movimiento personal' : kind === 'income' ? 'Nuevo ingreso' : 'Nuevo gasto personal'}
      onClose={onClose}
    >
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
        {!entry && (
          <fieldset className="segmented">
            <legend>Repetir</legend>
            {!template && (
              <label className={frequency === '' ? 'selected' : ''}>
                <input type="radio" name="pfreq" checked={frequency === ''} onChange={() => setFrequency('')} />
                No
              </label>
            )}
            {FREQUENCIES.map((f) => (
              <label key={f.id} className={frequency === f.id ? 'selected' : ''}>
                <input type="radio" name="pfreq" checked={frequency === f.id} onChange={() => setFrequency(f.id)} />
                {f.label}
              </label>
            ))}
          </fieldset>
        )}
        <label>
          {template ? 'Próxima vez' : frequency ? 'Primera vez' : 'Fecha'}
          <input type="date" required value={date} onChange={(e) => setDate(e.target.value)} />
        </label>
        {frequency && !template && (
          <p className="muted small">
            Se apuntará solo {frequencyText(frequency)} desde el {formatDay(date)}.
            {date < today() && ' Como esa fecha ya pasó, también se apuntarán ahora los anteriores hasta hoy.'}
          </p>
        )}
        {template && !template.active && <p className="muted small">En pausa: no se apunta hasta que lo reanudes.</p>}
        <label>
          Nota (opcional)
          <input maxLength={200} value={note} onChange={(e) => setNote(e.target.value)} placeholder={frequency ? 'Ej.: nómina, gimnasio' : ''} />
        </label>
        {error && <p className="error">{error}</p>}
        <div className="row wrap">
          {source && <button type="button" className="danger" onClick={remove} disabled={busy}>Borrar</button>}
          {template && (
            <button type="button" className="secondary" onClick={toggleActive} disabled={busy}>{template.active ? 'Pausar' : 'Reanudar'}</button>
          )}
          <button className="primary grow" disabled={busy}>{busy ? 'Guardando…' : 'Guardar'}</button>
        </div>
      </form>
    </Sheet>
  );
}
