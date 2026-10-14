import { useId, useState, type FormEvent } from 'react';
import { addDays, formatDay, formatShortDay, toIsoDate, today } from '../lib/dates';
import { centsToInput, formatEuros, parseEuros } from '../lib/money';
import { nameOf, partnerOf } from '../lib/people';
import { FREQUENCIES, frequencyText, nextDate, recurringDate } from '../lib/recurring';
import { defaultSplit, owedFromSplit, splitFromExpense, type SplitMode } from '../lib/split';
import { errorMessage, supabase } from '../lib/supabase';
import type { Expense, Frequency, RecurringExpense } from '../lib/types';
import { AmountField, Avatar, CategoryIcon, confirmAction, Notice, Segmented, Sheet, toast, type ViewProps  } from './common';
import { addedText } from './ExpenseRow';
import { Icon } from './icons';
import ScanReceipt from './ScanReceipt';
import { deleteWithUndo } from './undo';
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
  const formId = useId();
  const source = template ?? expense;
  const activeCategories = data.categories.filter((c) => !c.archived || c.id === source?.category_id);
  const initialDate = template ? nextDate(template) : expense?.spent_on ?? today();
  const [amount, setAmount] = useState(source ? centsToInput(source.amount_cents) : '');
  const [date, setDate] = useState(initialDate);
  const [categoryId, setCategoryId] = useState(source?.category_id ?? activeCategories[0]?.id ?? '');
  const [paidBy, setPaidBy] = useState(source?.paid_by ?? me);
  const [note, setNote] = useState(source?.note ?? '');
  const [split, setSplit] = useState(() => (source ? splitFromExpense(source, me) : defaultSplit(data.household, me, data.members)));
  // Solo los gastos nuevos y los fijos tienen frecuencia; '' = no se repite.
  const [frequency, setFrequency] = useState<Frequency | ''>(template?.frequency ?? (startAsFixed ? 'monthly' : ''));
  const partner = partnerOf(data.members, me);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [badAmount, setBadAmount] = useState(false);
  // Un gasto nuevo con el reparto por defecto no abre esta parte: el resumen ya lo dice.
  const [moreOpen, setMoreOpen] = useState((source != null && split.mode !== 'equal') || frequency !== '');

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
    setBadAmount(cents == null);
    if (cents == null) return setError(amount.trim() ? 'Ese importe no es válido. Escríbelo así: 12,50' : 'Escribe cuánto ha costado, por ejemplo 12,50');
    if (!categoryId) return setError('Elige una categoría');
    if (!date) return setError('Elige una fecha');
    const owed = owedFromSplit(split, cents, paidBy === me);
    if (owed === 'invalid') {
      setMoreOpen(true);
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
      toast('Gasto fijo actualizado');
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
      toast('Gasto fijo creado');
      return onClose();
    }

    const { error } = expense
      ? await supabase.from('expenses').update({ ...fields, spent_on: date }).eq('id', expense.id)
      : await supabase.from('expenses').insert({ ...fields, spent_on: date, household_id: data.household.id, created_by: me });
    setBusy(false);
    if (error) return setError(errorMessage(error));
    await reload();
    toast(expense ? 'Gasto actualizado' : 'Gasto guardado');
    onClose();
  }

  async function remove() {
    if (!template) {
      // Un gasto se borra al momento, con unos segundos para deshacerlo.
      if (expense) deleteWithUndo({ table: 'expenses', id: expense.id, done: 'Gasto borrado', reload });
      return onClose();
    }
    const ok = await confirmAction({ title: '¿Borrar este gasto fijo?', message: 'Los gastos que ya se apuntaron se quedan.', confirmLabel: 'Borrar', danger: true });
    if (!ok) return;
    setBusy(true);
    const { error } = await supabase.from('recurring_expenses').delete().eq('id', template.id);
    setBusy(false);
    if (error) return setError(errorMessage(error));
    await reload();
    toast('Gasto fijo borrado');
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
    toast(template.active ? 'Gasto fijo en pausa' : 'Gasto fijo reanudado');
    onClose();
  }

  const title = template ? 'Editar gasto fijo' : expense ? 'Editar gasto' : startAsFixed ? 'Nuevo gasto fijo' : 'Nuevo gasto';
  const showRepeat = !expense;
  const subtitle = expense?.created_by
    ? `${addedText(data.members, expense.created_by, me).replace(/^lo/, 'Lo')} el ${formatShortDay(toIsoDate(new Date(expense.created_at)))}`
    : undefined;
  const splitSummary = split.mode === 'equal' ? 'A medias' : split.mode === 'percent' ? `Tú ${split.myShare || '?'} %` : `Tu parte ${split.myShare || '?'} €`;
  const repeatSummary = frequency ? capitalizeFirst(frequencyText(frequency)) : 'No se repite';

  return (
    <Sheet
      title={title}
      subtitle={subtitle}
      onClose={onClose}
      footer={
        <>
          {error && <p className="error" role="alert">{error}</p>}
          <div className="row">
            {(expense || template) && (
              <button type="button" className="danger" onClick={remove} disabled={busy} aria-label={template ? 'Borrar gasto fijo' : 'Borrar gasto'}>
                <Icon name="trash" size={18} /> Borrar
              </button>
            )}
            {template && (
              <button type="button" className="secondary" onClick={toggleActive} disabled={busy}>
                <Icon name={template.active ? 'pause' : 'play'} size={18} /> {template.active ? 'Pausar' : 'Reanudar'}
              </button>
            )}
            <button type="submit" form={formId} className="primary lg" disabled={busy}>
              {busy ? 'Guardando…' : expense || template ? 'Guardar cambios' : 'Guardar gasto'}
            </button>
          </div>
        </>
      }
    >
      <form id={formId} onSubmit={save} className="stack" noValidate>
        {expense?.recurring_id && (
          <Notice icon="repeat">Lo apuntó un gasto fijo. Los cambios aquí solo afectan a este gasto.</Notice>
        )}

        <AmountField label="Importe" value={amount} onChange={(v) => { setAmount(v); setBadAmount(false); }} invalid={badAmount} autoFocus={!source} />

        {!source && <ScanReceipt onResult={applyScan} />}
        {scanned && <Notice kind="success">{scanned}</Notice>}

        <div className="field">
          <label className="field-label" htmlFor={formId + '-note'}>Concepto <span className="faint">(opcional)</span></label>
          <input
            id={formId + '-note'}
            maxLength={200}
            enterKeyHint="done"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={frequency ? 'Ej.: alquiler' : 'Ej.: compra semanal'}
          />
        </div>

        <fieldset className="category-picker">
          <legend className="field-label">Categoría</legend>
          {activeCategories.length === 0 ? (
            <p className="muted small">No hay categorías. Crea una en Ajustes.</p>
          ) : (
            <div className="category-grid">
              {activeCategories.map((c) => (
                <label key={c.id} className={categoryId === c.id ? 'selected' : ''}>
                  <input type="radio" name={formId + '-cat'} checked={categoryId === c.id} onChange={() => setCategoryId(c.id)} />
                  <CategoryIcon name={c.name} size="sm" />
                  <span className="cat-name">{c.name}</span>
                </label>
              ))}
            </div>
          )}
        </fieldset>

        {payers.length > 1 && (
          <Segmented
            legend="¿Quién pagó?"
            value={paidBy}
            options={payers.map((id) => ({
              value: id,
              label: <><Avatar members={data.members} userId={id} size="sm" />{nameOf(data.members, id, me)}</>,
            }))}
            onChange={setPaidBy}
          />
        )}

        <div className="field">
          <label className="field-label" htmlFor={formId + '-date'}>{template ? 'Próxima vez' : frequency ? 'Primera vez' : 'Fecha'}</label>
          <div className="row">
            <input id={formId + '-date'} className="grow" type="date" required value={date} onChange={(e) => setDate(e.target.value)} />
            {!template && (
              <div className="chips" role="group" aria-label="Fechas rápidas">
                <button type="button" className={'chip' + (date === today() ? ' selected' : '')} onClick={() => setDate(today())}>Hoy</button>
                <button type="button" className={'chip' + (date === addDays(today(), -1) ? ' selected' : '')} onClick={() => setDate(addDays(today(), -1))}>Ayer</button>
              </div>
            )}
          </div>
        </div>

        {(partner || showRepeat) && (
          <button type="button" className="disclosure" aria-expanded={moreOpen} onClick={() => setMoreOpen((v) => !v)}>
            <span>Reparto{showRepeat ? ' y repetición' : ''}</span>
            <span className="row">
              <span className="summary">{[partner ? splitSummary : null, showRepeat ? repeatSummary : null].filter(Boolean).join(' · ')}</span>
              <Icon name="chevronDown" size={18} />
            </span>
          </button>
        )}

        {moreOpen && (
          <div className="stack">
            {partner && (
              <SplitPicker
                mode={split.mode}
                myShare={split.myShare}
                amountCents={parseEuros(amount) ?? 0}
                partnerName={partner.display_name}
                onChange={setSplit}
              />
            )}
            {showRepeat && (
              <Segmented
                legend="Repetir"
                value={frequency}
                options={[...(template ? [] : [{ value: '' as const, label: 'No' }]), ...FREQUENCIES.map((f) => ({ value: f.id, label: f.label }))]}
                onChange={setFrequency}
              />
            )}
            {frequency && !template && (
              <p className="field-hint">
                Se apuntará solo {frequencyText(frequency)} desde el {formatDay(date)}.
                {date < today() && ' Como esa fecha ya pasó, también se apuntarán ahora los anteriores hasta hoy.'}
              </p>
            )}
          </div>
        )}

        {template && (
          <p className="field-hint">
            {template.active ? `Se apunta ${frequencyText(frequency || template.frequency)}.` : 'En pausa: no se apunta hasta que lo reanudes.'}{' '}
            Cambiarlo no toca los gastos que ya se apuntaron.
          </p>
        )}
      </form>
    </Sheet>
  );
}

const capitalizeFirst = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

const MODES: { value: SplitMode; label: string }[] = [
  { value: 'equal', label: 'A medias' },
  { value: 'percent', label: 'Por %' },
  { value: 'amount', label: 'Por importe' },
];

function SplitPicker({ mode, myShare, amountCents, partnerName, onChange }: {
  mode: SplitMode;
  myShare: string;
  amountCents: number;
  partnerName: string;
  onChange: (s: { mode: SplitMode; myShare: string }) => void;
}) {
  const inputId = useId();
  function setMode(next: SplitMode) {
    // Al cambiar de modo, parte de un reparto a medias equivalente.
    const half = next === 'amount' ? centsToInput(Math.round(amountCents / 2)) : '50';
    onChange({ mode: next, myShare: next === mode ? myShare : half });
  }

  let summary = 'Cada uno asume la mitad.';
  if (mode === 'percent') {
    const p = Number(myShare.replace(',', '.'));
    summary = Number.isFinite(p) && p >= 0 && p <= 100 ? `A ${partnerName} le toca el ${100 - p} %.` : 'Escribe un porcentaje entre 0 y 100.';
  } else if (mode === 'amount') {
    const mine = parseEuros(myShare, { allowZero: true });
    summary = mine != null && mine <= amountCents ? `A ${partnerName} le tocan ${formatEuros(amountCents - mine)}.` : 'Tu parte no puede superar el importe.';
  }

  return (
    <div className="stack-sm">
      <Segmented legend="Reparto" value={mode} options={MODES} onChange={setMode} />
      {mode !== 'equal' && (
        <div className="field">
          <label className="field-label" htmlFor={inputId}>{mode === 'percent' ? 'Tu parte (%)' : 'Tu parte (€)'}</label>
          <input id={inputId} inputMode="decimal" value={myShare} onChange={(e) => onChange({ mode, myShare: e.target.value })} />
          <div className="chips">
            <button type="button" className="chip" onClick={() => onChange({ mode: 'percent', myShare: '100' })}>Todo mío</button>
            <button type="button" className="chip" onClick={() => onChange({ mode: 'percent', myShare: '0' })}>Todo de {partnerName}</button>
          </div>
        </div>
      )}
      <p className="field-hint">{summary}</p>
    </div>
  );
}
