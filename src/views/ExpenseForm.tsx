import { useState, type FormEvent } from 'react';
import { formatDay, today } from '../lib/dates';
import { centsToInput, formatEuros, parseEuros } from '../lib/money';
import { nameOf, partnerOf } from '../lib/people';
import { FREQUENCIES, frequencyText, nextDate, recurringDate } from '../lib/recurring';
import { owedFromSplit, splitFromExpense, type SplitMode } from '../lib/split';
import { errorMessage, supabase } from '../lib/supabase';
import type { Expense, Frequency, RecurringExpense } from '../lib/types';
import { Sheet, type ViewProps } from './common';
import ScanReceipt from './ScanReceipt';
import type { ReceiptGuess } from '../lib/receipt';

interface Props extends ViewProps {
  /** Gasto a editar; null = nuevo. */
  expense: Expense | null;
  /** Si se pasa, se edita este gasto fijo en vez de un gasto. */
  template?: RecurringExpense;
  /** Gasto nuevo que empieza marcado como mensual. */
  startAsFixed?: boolean;
  onClose: () => void;
}

export default function ExpenseForm({ data, me, reload, expense, template, startAsFixed, onClose }: Props) {
  const source = template ?? expense;
  const activeCategories = data.categories.filter((c) => !c.archived || c.id === source?.category_id);
  const initialDate = template ? nextDate(template) : expense?.spent_on ?? today();
  const [amount, setAmount] = useState(source ? centsToInput(source.amount_cents) : '');
  const [date, setDate] = useState(initialDate);
  const [categoryId, setCategoryId] = useState(source?.category_id ?? activeCategories[0]?.id ?? '');
  const [paidBy, setPaidBy] = useState(source?.paid_by ?? me);
  const [note, setNote] = useState(source?.note ?? '');
  const [split, setSplit] = useState(() => splitFromExpense(source, me));
  // Solo los gastos nuevos y los fijos tienen frecuencia; '' = no se repite.
  const [frequency, setFrequency] = useState<Frequency | ''>(template?.frequency ?? (startAsFixed ? 'monthly' : ''));
  const partner = partnerOf(data.members, me);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [scanned, setScanned] = useState<string | null>(null);

  function applyScan(g: ReceiptGuess) {
    const filled: string[] = [];
    if (g.amountCents != null) {
      setAmount(centsToInput(g.amountCents));
      filled.push('importe');
    }
    if (g.date) {
      setDate(g.date);
      filled.push('fecha');
    }
    if (g.merchant && !note.trim()) {
      setNote(g.merchant);
      filled.push('tienda');
    }
    const category = g.categoryName && activeCategories.find((c) => c.name.toLowerCase() === g.categoryName!.toLowerCase());
    if (category) {
      setCategoryId(category.id);
      filled.push('categoría');
    }
    setScanned(`He rellenado: ${filled.join(', ')}. Revísalo antes de guardar.`);
  }

  const payers = data.members.map((m) => m.user_id);
  if (!payers.includes(paidBy)) payers.push(paidBy); // gasto de una cuenta borrada

  async function save(e: FormEvent) {
    e.preventDefault();
    const cents = parseEuros(amount);
    if (cents == null) return setError('Escribe un importe válido, por ejemplo 12,50');
    if (!categoryId) return setError('Elige una categoría');
    const owed = owedFromSplit(split, cents, paidBy === me);
    if (owed === 'invalid') {
      return setError(split.mode === 'percent' ? 'El porcentaje debe estar entre 0 y 100' : 'Tu parte no puede ser mayor que el importe');
    }
    const fields = { amount_cents: cents, category_id: categoryId, paid_by: paidBy, owed_cents: owed, note: note.trim() || null };

    if (template) {
      const rescheduled = date !== initialDate || frequency !== template.frequency;
      if (rescheduled && date <= today()) return setError('La próxima vez tiene que ser una fecha a partir de mañana');
      setBusy(true);
      setError(null);
      const { error } = await supabase
        .from('recurring_expenses')
        .update(rescheduled ? { ...fields, frequency, start_on: date, generated_count: 0 } : fields)
        .eq('id', template.id);
      setBusy(false);
      if (error) return setError(errorMessage(error));
      await reload();
      return onClose();
    }

    setBusy(true);
    setError(null);
    if (!expense && frequency) {
      const { error } = await supabase.from('recurring_expenses').insert({
        ...fields, frequency, start_on: date, household_id: data.household.id, created_by: me,
      });
      setBusy(false);
      if (error) return setError(errorMessage(error));
      await reload(); // al recargar se apuntan los que ya tocan
      return onClose();
    }

    const { error } = expense
      ? await supabase.from('expenses').update({ ...fields, spent_on: date }).eq('id', expense.id)
      : await supabase.from('expenses').insert({ ...fields, spent_on: date, household_id: data.household.id, created_by: me });
    setBusy(false);
    if (error) return setError(errorMessage(error));
    await reload();
    onClose();
  }

  async function remove() {
    if (template) {
      if (!confirm('¿Borrar este gasto fijo? Los gastos que ya se apuntaron se quedan.')) return;
    } else if (!expense || !confirm('¿Borrar este gasto?')) return;
    setBusy(true);
    const { error } = template
      ? await supabase.from('recurring_expenses').delete().eq('id', template.id)
      : await supabase.from('expenses').delete().eq('id', expense!.id);
    setBusy(false);
    if (error) return setError(errorMessage(error));
    await reload();
    onClose();
  }

  async function toggleActive() {
    if (!template) return;
    const patch: Partial<RecurringExpense> = { active: !template.active };
    if (!template.active) {
      // Al reanudar no se apuntan los periodos que estuvo en pausa: se salta a la próxima fecha desde hoy.
      let n = template.generated_count;
      while (recurringDate(template.start_on, template.frequency, n) < today()) n++;
      patch.generated_count = n;
    }
    setBusy(true);
    const { error } = await supabase.from('recurring_expenses').update(patch).eq('id', template.id);
    setBusy(false);
    if (error) return setError(errorMessage(error));
    await reload();
    onClose();
  }

  const title = template ? 'Editar gasto fijo' : expense ? 'Editar gasto' : startAsFixed ? 'Nuevo gasto fijo' : 'Nuevo gasto';
  const showRepeat = !expense;

  return (
    <Sheet title={title} onClose={onClose}>
      <form onSubmit={save} className="stack">
        {expense?.recurring_id && (
          <p className="notice small">🔁 Lo apuntó un gasto fijo. Los cambios aquí solo afectan a este gasto.</p>
        )}
        {!source && <ScanReceipt onResult={applyScan} />}
        {scanned && <p className="notice small">{scanned}</p>}
        <label>
          Importe (€)
          <input
            className="amount-input"
            inputMode="decimal"
            autoFocus={!source}
            required
            placeholder="0,00"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
        </label>
        <fieldset className="segmented">
          <legend>¿Quién pagó?</legend>
          {payers.map((id) => (
            <label key={id} className={paidBy === id ? 'selected' : ''}>
              <input type="radio" name="paid_by" value={id} checked={paidBy === id} onChange={() => setPaidBy(id)} />
              {nameOf(data.members, id, me)}
            </label>
          ))}
        </fieldset>
        {partner && (
          <SplitPicker
            mode={split.mode}
            myShare={split.myShare}
            amountCents={parseEuros(amount) ?? 0}
            partnerName={partner.display_name}
            onChange={setSplit}
          />
        )}
        <label>
          Categoría
          <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)} required>
            {activeCategories.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </label>
        {showRepeat && (
          <fieldset className="segmented">
            <legend>Repetir</legend>
            {!template && (
              <label className={frequency === '' ? 'selected' : ''}>
                <input type="radio" name="frequency" checked={frequency === ''} onChange={() => setFrequency('')} />
                No
              </label>
            )}
            {FREQUENCIES.map((f) => (
              <label key={f.id} className={frequency === f.id ? 'selected' : ''}>
                <input type="radio" name="frequency" checked={frequency === f.id} onChange={() => setFrequency(f.id)} />
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
        {template && (
          <p className="muted small">
            {template.active ? `Se apunta ${frequencyText(frequency || template.frequency)}.` : 'En pausa: no se apunta hasta que lo reanudes.'}{' '}
            Cambiarlo no toca los gastos que ya se apuntaron.
          </p>
        )}
        <label>
          Nota (opcional)
          <input maxLength={200} value={note} onChange={(e) => setNote(e.target.value)} placeholder={frequency ? 'Ej.: alquiler' : 'Ej.: compra semanal'} />
        </label>
        {error && <p className="error">{error}</p>}
        <div className="row wrap">
          {(expense || template) && (
            <button type="button" className="danger" onClick={remove} disabled={busy}>Borrar</button>
          )}
          {template && (
            <button type="button" className="secondary" onClick={toggleActive} disabled={busy}>
              {template.active ? 'Pausar' : 'Reanudar'}
            </button>
          )}
          <button className="primary grow" disabled={busy}>{busy ? 'Guardando…' : 'Guardar'}</button>
        </div>
      </form>
    </Sheet>
  );
}

const MODES: { id: SplitMode; label: string }[] = [
  { id: 'equal', label: '50/50' },
  { id: 'percent', label: '%' },
  { id: 'amount', label: '€' },
];

function SplitPicker({ mode, myShare, amountCents, partnerName, onChange }: {
  mode: SplitMode;
  myShare: string;
  amountCents: number;
  partnerName: string;
  onChange: (s: { mode: SplitMode; myShare: string }) => void;
}) {
  function setMode(next: SplitMode) {
    // Al cambiar de modo, parte de un reparto a medias equivalente.
    const half = next === 'amount' ? centsToInput(Math.round(amountCents / 2)) : '50';
    onChange({ mode: next, myShare: next === mode ? myShare : half });
  }

  let summary = 'A partes iguales: cada uno asume la mitad.';
  if (mode === 'percent') {
    const p = Number(myShare.replace(',', '.'));
    summary = Number.isFinite(p) && p >= 0 && p <= 100 ? `A ${partnerName} le toca el ${100 - p} %.` : 'Escribe un porcentaje entre 0 y 100.';
  } else if (mode === 'amount') {
    const mine = parseEuros(myShare, { allowZero: true });
    summary = mine != null && mine <= amountCents ? `A ${partnerName} le tocan ${formatEuros(amountCents - mine)}.` : 'Tu parte no puede superar el importe.';
  }

  return (
    <div className="stack tight">
      <fieldset className="segmented">
        <legend>Reparto</legend>
        {MODES.map((m) => (
          <label key={m.id} className={mode === m.id ? 'selected' : ''}>
            <input type="radio" name="split" checked={mode === m.id} onChange={() => setMode(m.id)} />
            {m.label}
          </label>
        ))}
      </fieldset>
      {mode !== 'equal' && (
        <div className="row">
          <label className="grow">
            {mode === 'percent' ? 'Tu parte (%)' : 'Tu parte (€)'}
            <input inputMode="decimal" value={myShare} onChange={(e) => onChange({ mode, myShare: e.target.value })} />
          </label>
          <button type="button" className="secondary chip-btn" onClick={() => onChange({ mode: 'percent', myShare: '100' })}>Todo mío</button>
          <button type="button" className="secondary chip-btn" onClick={() => onChange({ mode: 'percent', myShare: '0' })}>Todo de {partnerName}</button>
        </div>
      )}
      <p className="muted small">{summary}</p>
    </div>
  );
}
