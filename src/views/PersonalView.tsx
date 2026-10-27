import { useId, useMemo, useState, type FormEvent } from 'react';
import { formatDay, formatDayHeading, monthOf, today } from '../lib/dates';
import { centsToInput, formatEuros, parseEuros } from '../lib/money';
import { categoryOptions, categoryProposals, dismissedProposals, myCommonShare, personalMonth } from '../lib/personal';
import { errorMessage, supabase } from '../lib/supabase';
import { FREQUENCIES, frequencyText, monthlyEquivalent, nextDate, recurringDate } from '../lib/recurring';
import type { PaymentPrefill } from '../lib/payments';
import type { Frequency, PersonalEntry, PersonalRecurring } from '../lib/types';
import { AmountField, capitalize, CategoryIcon, confirmAction, EmptyState, MonthNav, Notice, Segmented, Sheet, toast, type ViewProps, useMonth } from './common';
import { Icon } from './icons';
import ImportStatement from './ImportStatement';
import { PersonalBudgetSection, PersonalTrends } from './PersonalBudget';
import PersonalReviewSheet, { PersonalReviewCard, usePersonalReview } from './PersonalReview';
import Recategorize from './Recategorize';
import { deleteWithUndo } from './undo';

export default function PersonalView(props: ViewProps) {
  const { data, me } = props;
  const [month, setMonth] = useMonth();
  const [editing, setEditing] = useState<PersonalEntry | 'expense' | 'income' | null>(null);
  const [template, setTemplate] = useState<PersonalRecurring | null>(null);
  const [showFixed, setShowFixed] = useState(false);
  const [importing, setImporting] = useState(false);
  const [reviewing, setReviewing] = useState(false);
  const review = usePersonalReview(data.personal, data.personalRecurring);
  const [sorting, setSorting] = useState(false);
  const proposals = useMemo(() => categoryProposals(data.personal, dismissedProposals()), [data.personal]);

  const sum = personalMonth(data.personal, month);
  const common = myCommonShare(me, data.expenses, month);
  const entries = data.personal.filter((e) => monthOf(e.entry_on) === month);
  const days = [...new Set(entries.map((e) => e.entry_on))];

  return (
    <>
      <Notice icon="lock">Solo tú ves esta sección. No cuenta en los gastos comunes.</Notice>
      <MonthNav month={month} onChange={setMonth} />

      <section className="card hero" aria-label="Tu mes">
        <div>
          <p className="stat-label">Te queda este mes</p>
          <p className={'stat-big' + (sum.netCents < 0 ? ' negative' : '')}>{formatEuros(sum.netCents)}</p>
        </div>
        <div className="stat-grid">
          <div className="stat-tile">
            <span className="stat-label">Ingresos</span>
            <strong className={sum.incomeCents > 0 ? 'positive' : ''}>{formatEuros(sum.incomeCents)}</strong>
          </div>
          <div className="stat-tile">
            <span className="stat-label">Gastos personales</span>
            <strong className={sum.expenseCents > 0 ? 'negative' : ''}>{sum.expenseCents > 0 ? '−' : ''}{formatEuros(sum.expenseCents)}</strong>
          </div>
        </div>
        {common > 0 && (
          <p className="muted small">
            Tu parte de los gastos comunes este mes es {formatEuros(common)}. Contándola, te quedarían{' '}
            <strong className={sum.netCents - common < 0 ? 'negative' : ''}>{formatEuros(sum.netCents - common)}</strong>.
          </p>
        )}
        <div className="row">
          <button className="tinted grow" onClick={() => setEditing('income')}><Icon name="plus" size={18} /> Ingreso</button>
          <button className="tinted grow" onClick={() => setEditing('expense')}><Icon name="minus" size={18} /> Gasto</button>
        </div>
      </section>

      <div className="row wrap">
        <button className="pill" onClick={() => setShowFixed(true)}>
          <Icon name="repeat" size={16} /> Fijos {data.personalRecurring.length > 0 && <span className="count">{data.personalRecurring.length}</span>}
        </button>
        <button className="pill" onClick={() => setImporting(true)}>
          <Icon name="fileIn" size={16} /> Importar extracto
        </button>
      </div>

      {proposals.length > 0 && (
        <Notice icon="tag" action={<button className="sm tinted" onClick={() => setSorting(true)}>Ordenar</button>}>
          {proposals.length === 1 ? 'Un gasto en «Otros» parece' : `${proposals.length} gastos en «Otros» parecen`} de otra categoría, como Supermercado o Electrónica.
        </Notice>
      )}

      <PersonalReviewCard review={review} onOpen={() => setReviewing(true)} />

      <PersonalBudgetSection {...props} month={month} />
      <PersonalTrends {...props} />

      {entries.length === 0 ? (
        <div className="card">
          <EmptyState
            icon="user"
            title="Nada apuntado este mes"
            text="Apunta tus ingresos y gastos personales para ver cuánto te queda. Nadie más los ve."
          />
        </div>
      ) : (
        days.map((day) => {
          const items = entries.filter((e) => e.entry_on === day);
          return (
            <section key={day} className="day-group" aria-label={formatDayHeading(day)}>
              <div className="day-head"><span>{formatDayHeading(day)}</span></div>
              <ul className="list with-icons">
                {items.map((e) => (
                  <li key={e.id}>
                    <button className="row-item" onClick={() => setEditing(e)}>
                      <CategoryIcon name={e.category} />
                      <span className="row-main">
                        <span className="row-title">{e.note || e.category}</span>
                        <span className="row-meta">
                          {e.recurring_id && <><Icon name="repeat" size={14} label="Fijo" />{' '}</>}
                          {e.kind === 'income' ? 'Ingreso' : 'Gasto'}{e.note ? ` · ${e.category}` : ''}
                        </span>
                      </span>
                      <span className={'row-amount ' + (e.kind === 'income' ? 'positive' : '')}>
                        {e.kind === 'income' ? '+' : '−'}{formatEuros(e.amount_cents)}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          );
        })
      )}

      {showFixed && !template && (
        <Sheet
          title="Ingresos y gastos fijos"
          subtitle="Se apuntan solos cada semana, mes o año."
          onClose={() => setShowFixed(false)}
          footer={
            <div className="row">
              <button className="tinted" onClick={() => { setShowFixed(false); setEditing('income'); }}><Icon name="plus" size={18} /> Ingreso fijo</button>
              <button className="tinted" onClick={() => { setShowFixed(false); setEditing('expense'); }}><Icon name="minus" size={18} /> Gasto fijo</button>
            </div>
          }
        >
          <FixedList items={data.personalRecurring} onEdit={setTemplate} />
          <p className="field-hint" style={{ marginTop: 'var(--s4)' }}>Al crear un ingreso o gasto, elige cada cuánto se repite y se apuntará solo.</p>
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
      {sorting && <Recategorize {...props} proposals={proposals} onClose={() => setSorting(false)} />}
      {reviewing && <PersonalReviewSheet review={review} onClose={() => setReviewing(false)} />}
      {importing && <ImportStatement {...props} onClose={() => setImporting(false)} />}
    </>
  );
}

function FixedList({ items, onEdit }: { items: PersonalRecurring[]; onEdit: (r: PersonalRecurring) => void }) {
  if (items.length === 0) return <EmptyState icon="repeat" title="Todavía no tienes fijos" text="Por ejemplo: la nómina, el gimnasio o una suscripción." />;
  const active = items.filter((r) => r.active);
  const income = active.filter((r) => r.kind === 'income').reduce((s, r) => s + monthlyEquivalent(r), 0);
  const expense = active.filter((r) => r.kind === 'expense').reduce((s, r) => s + monthlyEquivalent(r), 0);
  const sorted = [...items].sort((a, b) => Number(b.active) - Number(a.active) || nextDate(a).localeCompare(nextDate(b)));
  return (
    <div className="stack">
      <div className="stat-grid">
        <div className="stat-tile"><span className="stat-label">Ingresos fijos al mes</span><strong className="positive">{formatEuros(income)}</strong></div>
        <div className="stat-tile"><span className="stat-label">Gastos fijos al mes</span><strong className="negative">{formatEuros(expense)}</strong></div>
      </div>
      <ul className="list with-icons">
        {sorted.map((r) => (
          <li key={r.id}>
            <button className={'row-item' + (r.active ? '' : ' paused')} onClick={() => onEdit(r)}>
              <CategoryIcon name={r.category} />
              <span className="row-main">
                <span className="row-title">{r.note || r.category}</span>
                <span className="row-meta">
                  {r.active ? `${capitalize(frequencyText(r.frequency))} · próximo ${formatDay(nextDate(r))}` : 'En pausa'} · {r.category}
                </span>
              </span>
              <span className={'row-amount ' + (r.kind === 'income' ? 'positive' : '')}>
                {r.kind === 'income' ? '+' : '−'}{formatEuros(r.amount_cents)}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function PersonalForm({ data, reload, entry, template, kind: initialKind, prefill, onSaved, onClose }: ViewProps & {
  entry: PersonalEntry | null;
  /** Gasto nuevo con los datos de un pago con Apple Pay. */
  prefill?: PaymentPrefill & { category: string | null };
  /** Se llama cuando el movimiento nuevo se ha guardado (antes de cerrar). */
  onSaved?: () => void;
  /** Si se pasa, se edita este fijo en vez de un movimiento. */
  template?: PersonalRecurring;
  kind: PersonalEntry['kind'];
  onClose: () => void;
}) {
  const source = template ?? entry;
  const initialDate = template ? nextDate(template) : entry?.entry_on ?? prefill?.date ?? today();
  const [kind, setKind] = useState(initialKind);
  const [amount, setAmount] = useState(source ? centsToInput(source.amount_cents) : prefill?.amountCents != null ? centsToInput(prefill.amountCents) : '');
  const [category, setCategory] = useState(source?.category ?? prefill?.category ?? '');
  const [date, setDate] = useState(initialDate);
  const [note, setNote] = useState(source?.note ?? prefill?.note ?? '');
  // '' = no se repite. Solo para movimientos nuevos y fijos.
  const [frequency, setFrequency] = useState<Frequency | ''>(template?.frequency ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const options = categoryOptions(data.personal, kind);

  async function save(e: FormEvent) {
    e.preventDefault();
    const cents = parseEuros(amount);
    if (cents == null) return setError('Escribe un importe válido, por ejemplo 12,50');
    if (!date) return setError('Elige una fecha');
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
    if (!entry && !template) onSaved?.();
    await reload();
    toast(template ? 'Fijo actualizado' : !entry && frequency ? 'Fijo creado' : entry ? 'Movimiento actualizado' : 'Movimiento guardado');
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
    toast(template.active ? 'Fijo en pausa' : 'Fijo reanudado');
    onClose();
  }

  async function remove() {
    if (!source) return;
    if (!template) {
      deleteWithUndo({ table: 'personal_entries', id: entry!.id, done: 'Movimiento borrado', reload });
      return onClose();
    }
    const ok = await confirmAction({ title: '¿Borrar este fijo?', message: 'Lo que ya se apuntó se queda.', confirmLabel: 'Borrar', danger: true });
    if (!ok) return;
    setBusy(true);
    const { error } = await supabase.from('personal_recurring').delete().eq('id', template.id);
    setBusy(false);
    if (error) return setError(errorMessage(error));
    await reload();
    toast('Fijo borrado');
    onClose();
  }

  const formId = useId();
  const title = template ? 'Editar fijo' : entry ? 'Editar movimiento' : kind === 'income' ? 'Nuevo ingreso' : 'Nuevo gasto personal';

  return (
    <Sheet
      title={title}
      subtitle="Solo lo ves tú."
      onClose={onClose}
      footer={
        <>
          {error && <p className="error" role="alert">{error}</p>}
          <div className="row">
            {source && <button type="button" className="danger" onClick={remove} disabled={busy}><Icon name="trash" size={18} /> Borrar</button>}
            {template && (
              <button type="button" className="secondary" onClick={toggleActive} disabled={busy}>
                <Icon name={template.active ? 'pause' : 'play'} size={18} /> {template.active ? 'Pausar' : 'Reanudar'}
              </button>
            )}
            <button type="submit" form={formId} className="primary lg" disabled={busy}>{busy ? 'Guardando…' : 'Guardar'}</button>
          </div>
        </>
      }
    >
      <form id={formId} onSubmit={save} className="stack" noValidate>
        <Segmented
          legend="Tipo"
          hideLegend
          value={kind}
          options={[{ value: 'income', label: 'Ingreso' }, { value: 'expense', label: 'Gasto' }]}
          onChange={(k) => { setKind(k); setCategory(''); }}
        />
        {prefill && (
          <Notice icon="card">Pago con Apple Pay{prefill.amountCents == null ? '. No se ha entendido el importe: escríbelo tú.' : '. Revisa los datos y guárdalo.'}</Notice>
        )}
        <AmountField label="Importe" value={amount} onChange={setAmount} autoFocus={!entry && !template && (!prefill || prefill.amountCents == null)} tone={kind === 'income' ? 'positive' : undefined} />
        <div className="field">
          <label className="field-label" htmlFor={formId + '-cat'}>Categoría</label>
          <input id={formId + '-cat'} list={formId + '-cats'} maxLength={40} value={category} onChange={(e) => setCategory(e.target.value)} placeholder={options[0]} />
          <datalist id={formId + '-cats'}>
            {options.map((o) => <option key={o} value={o} />)}
          </datalist>
          <div className="chips">
            {options.slice(0, 6).map((o) => (
              <button type="button" key={o} className={'chip' + (category === o ? ' selected' : '')} onClick={() => setCategory(o)}>{o}</button>
            ))}
          </div>
        </div>
        {!entry && (
          <Segmented
            legend="Repetir"
            value={frequency}
            options={[...(template ? [] : [{ value: '' as const, label: 'No' }]), ...FREQUENCIES.map((f) => ({ value: f.id, label: f.label }))]}
            onChange={setFrequency}
          />
        )}
        <div className="field">
          <label className="field-label" htmlFor={formId + '-date'}>{template ? 'Próxima vez' : frequency ? 'Primera vez' : 'Fecha'}</label>
          <input id={formId + '-date'} type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        {frequency && !template && (
          <p className="field-hint">
            Se apuntará solo {frequencyText(frequency)} desde el {formatDay(date)}.
            {date < today() && ' Como esa fecha ya pasó, también se apuntarán ahora los anteriores hasta hoy.'}
          </p>
        )}
        {template && !template.active && <p className="field-hint">En pausa: no se apunta hasta que lo reanudes.</p>}
        <div className="field">
          <label className="field-label" htmlFor={formId + '-note'}>Nota <span className="faint">(opcional)</span></label>
          <input id={formId + '-note'} maxLength={200} value={note} onChange={(e) => setNote(e.target.value)} placeholder={frequency ? 'Ej.: nómina, gimnasio' : ''} />
        </div>
      </form>
    </Sheet>
  );
}
