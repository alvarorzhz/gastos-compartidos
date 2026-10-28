import { useContext, useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { addDays, formatDay, formatShortDay, toIsoDate, today } from '../lib/dates';
import { centsToInput, formatEuros, parseEuros } from '../lib/money';
import { nameOf, partnerOf } from '../lib/people';
import { FREQUENCIES, frequencyText, nextDate, recurringDate } from '../lib/recurring';
import { choiceOf, formatPercent, HALF, owedFromSplit, simpleSplit, splitForChoice, splitFromExpense, type SplitChoice, type SplitState } from '../lib/split';
import { errorMessage, supabase } from '../lib/supabase';
import type { Expense, Frequency, RecurringExpense } from '../lib/types';
import { ReactionPicker } from './Reactions';
import { AmountField, Avatar, CategoryIcon, confirmAction, Notice, Segmented, Sheet, toast, type ViewProps  } from './common';
import { addedText } from './ExpenseRow';
import { Icon } from './icons';
import ScanReceipt from './ScanReceipt';
import { deleteWithUndo } from './undo';
import type { ReceiptGuess, ReceiptLine } from '../lib/receipt';
import { currentEvent, eventDates, selectableEvents } from '../lib/events';
import { isOfflineError, isQueued, queueExpense, removeQueued, updateQueued } from '../lib/expenseOutbox';
import { habituals, type Habitual } from '../lib/favorites';
import { notifyNewExpenses } from '../lib/push';
import { currentBought, formatQuantity } from '../lib/shopping';
import { matchTicket, prettyTicketName, ticketNewItems } from '../lib/shoppingPrices';
import { ShoppingContext, ShoppingItemsContext } from '../lib/useShopping';
import { TicketItems } from './shopping/TicketItems';
import { suggestForNote } from '../lib/suggest';
import type { PaymentPrefill } from '../lib/payments';

interface Props extends ViewProps {
  /** Gasto a editar; null = nuevo. */
  expense: Expense | null;
  /** Si se pasa, se edita este gasto fijo en vez de un gasto. */
  template?: RecurringExpense;
  /** Gasto nuevo que empieza marcado como mensual. */
  startAsFixed?: boolean;
  /** Gasto nuevo con los datos de un pago con Apple Pay. */
  prefill?: PaymentPrefill;
  /** Se llama cuando el gasto nuevo se ha guardado (antes de cerrar). */
  onSaved?: () => void;
  onClose: () => void;
}

export default function ExpenseForm({ data, me, reload, expense, template, startAsFixed, prefill, onSaved, onClose }: Props) {
  const formId = useId();
  const source = template ?? expense;
  const activeCategories = data.categories.filter((c) => !c.archived || c.id === source?.category_id);
  const initialDate = template ? nextDate(template) : expense?.spent_on ?? prefill?.date ?? today();
  const [amount, setAmount] = useState(source ? centsToInput(source.amount_cents) : prefill?.amountCents != null ? centsToInput(prefill.amountCents) : '');
  const [date, setDate] = useState(initialDate);
  const [categoryId, setCategoryId] = useState(source?.category_id ?? activeCategories[0]?.id ?? '');
  const [paidBy, setPaidBy] = useState(source?.paid_by ?? me);
  const [note, setNote] = useState(source?.note ?? prefill?.note ?? '');
  const [split, setSplit] = useState(() => (source ? splitFromExpense(source, me) : HALF));
  // Un gasto antiguo con un reparto que no es ninguna de las tres opciones se queda como estaba.
  const [oldSplit] = useState(split);
  // Solo los gastos nuevos y los fijos tienen frecuencia; '' = no se repite.
  const [frequency, setFrequency] = useState<Frequency | ''>(template?.frequency ?? (startAsFixed ? 'monthly' : ''));
  const partner = partnerOf(data.members, me);
  const myName = data.members.find((m) => m.user_id === me)?.display_name ?? 'Tú';
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [badAmount, setBadAmount] = useState(false);
  // Un gasto nuevo a medias no abre esta parte: el resumen ya lo dice.
  const [moreOpen, setMoreOpen] = useState((source != null && split.mode !== 'equal') || frequency !== '');

  const [scanned, setScanned] = useState<string | null>(null);
  // Productos del ticket escaneado: se guardan en la compra con su precio (los de la lista y los nuevos).
  const shopping = useContext(ShoppingContext);
  const [ticketLines, setTicketLines] = useState<ReceiptLine[]>([]);
  const [saveTicket, setSaveTicket] = useState(false);
  const [ticketSkipped, setTicketSkipped] = useState<Set<number>>(new Set());
  const [ticketNames, setTicketNames] = useState<Record<number, string>>({});
  // Viaje o evento: los gastos nuevos van solos al que esté en curso.
  const [eventId, setEventId] = useState(() => (template ? '' : expense ? expense.event_id ?? '' : currentEvent(data.events, today())?.id ?? ''));
  const events = template ? [] : selectableEvents(data.events, eventId);
  const quick = !source && !startAsFixed && !prefill ? habituals(data.expenses, today()) : [];
  const [filledFrom, setFilledFrom] = useState<string | null>(null);
  // Si el gasto se apuntó al terminar una compra: lo que se compró.
  const shoppingItems = useContext(ShoppingItemsContext);
  const boughtHere = expense ? shoppingItems.filter((i) => i.expense_id === expense.id) : [];
  const listItems = shopping ? [...shopping.items.filter((i) => i.status === 'pending' && !i.unsaved), ...currentBought(shopping.items.filter((i) => !i.unsaved))] : [];
  const ticketMatches = shopping ? matchTicket(listItems, ticketLines, shopping.items) : [];
  const ticketFresh = shopping ? ticketNewItems(ticketLines, new Set(ticketMatches.map((m) => m.line)), shopping.items) : [];
  const ticketRows = [
    ...ticketMatches.map((m) => ({ key: m.line, name: prettyTicketName(ticketLines[m.line].name), cents: ticketLines[m.line].cents, listName: listItems.find((i) => i.id === m.itemId)?.name })),
    ...ticketFresh.map((f) => ({ key: f.line, name: f.name, cents: f.cents })),
  ].sort((a, b) => a.key - b.key);
  const ticketCount = ticketRows.filter((r) => !ticketSkipped.has(r.key)).length;
  // Lo que se elige a mano no lo vuelve a cambiar la propuesta del concepto.
  const touched = useRef({ category: false, paidBy: false, split: false });
  const [suggested, setSuggested] = useState<string | null>(null);

  /** Gasto nuevo: al escribir el concepto, rellena categoría, quién paga y reparto como otras veces. */
  function suggestFrom(text: string) {
    if (source) return;
    const s = suggestForNote(text, { expenses: data.expenses, categories: activeCategories, members: data.members, me });
    if (!s) return setSuggested(null);
    const parts: string[] = [];
    if (s.categoryId && !touched.current.category) {
      setCategoryId(s.categoryId);
      parts.push(activeCategories.find((c) => c.id === s.categoryId)?.name ?? '');
    }
    if (s.paidBy && !touched.current.paidBy && data.members.length > 1) {
      setPaidBy(s.paidBy);
      if (s.paidBy !== me) parts.push(`pagó ${nameOf(data.members, s.paidBy, me)}`);
    }
    if (s.split && !touched.current.split && partner) {
      setSplit(s.split);
      const choice = choiceOf(s.split);
      if (choice !== choiceOf(split)) parts.push(choice === 'equal' ? 'a medias' : `todo de ${choice === 'mine' ? myName : partner.display_name}`);
    }
    const shown = parts.filter(Boolean);
    setSuggested(shown.length === 0 ? null : s.from === 'history' ? `Como otras veces: ${shown.join(', ')}.` : `Categoría propuesta: ${shown[0]}.`);
  }

  // Pago con Apple Pay: la tienda rellena lo de otras veces, como si se hubiera escrito.
  useEffect(() => {
    if (prefill?.note) suggestFrom(prefill.note);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- solo al abrir el formulario.
  }, []);

  function changeNote(text: string) {
    setNote(text);
    suggestFrom(text);
  }

  function applyHabitual(h: Habitual) {
    setAmount(centsToInput(h.amountCents));
    setBadAmount(false);
    setNote(h.note ?? '');
    if (activeCategories.some((c) => c.id === h.categoryId)) setCategoryId(h.categoryId);
    setSplit(simpleSplit(splitFromExpense({ ...h.last, paid_by: paidBy }, me)));
    setDate(today());
    setFrequency('');
    setError(null);
    setFilledFrom(h.key);
    setSuggested(null);
    touched.current.category = true;
    touched.current.split = true;
  }

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
    // Si esa tienda ya se apuntó otras veces, manda lo de otras veces.
    if (g.merchant && !note.trim()) suggestFrom(g.merchant);
    setScanned(`He rellenado: ${filled.join(', ')}. Revísalo antes de guardar.`);
    // Los productos van a la compra si es un súper o si trae cosas de la lista.
    const lines = g.lines.filter((l) => l.cents > 0);
    setTicketLines(g.lines);
    setTicketSkipped(new Set());
    setTicketNames({});
    setSaveTicket(lines.length > 0 && (g.categoryName === 'Supermercado' || (shopping != null && matchTicket(listItems, g.lines, shopping.items).length > 0)));
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
    // Solo se manda el viaje si se usa (así no hace falta para quien no tenga viajes).
    const eventFields = eventId ? { event_id: eventId } : expense?.event_id ? { event_id: null } : {};

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
      onSaved?.();
      await reload(); // al recargar se apuntan los que ya tocan
      toast('Gasto fijo creado');
      return onClose();
    }

    if (expense && isQueued(expense.id)) {
      // Aún no se ha subido: se cambia la copia del móvil.
      updateQueued(expense.id, { ...fields, ...eventFields, spent_on: date });
      setBusy(false);
      toast('Gasto actualizado');
      return onClose();
    }

    if (expense) {
      const { error } = await supabase.from('expenses').update({ ...fields, ...eventFields, spent_on: date }).eq('id', expense.id);
      setBusy(false);
      if (error) return setError(errorMessage(error));
      await reload();
      toast('Gasto actualizado');
      return onClose();
    }

    // Gasto nuevo: lleva su id desde el móvil para poder guardarlo sin conexión y subirlo luego sin duplicarlo.
    const now = new Date().toISOString();
    const row: Expense = {
      ...fields, ...eventFields, id: crypto.randomUUID(), spent_on: date, household_id: data.household.id,
      created_by: me, recurring_id: null, created_at: now, updated_at: now,
    };
    const { error } = await supabase.from('expenses').insert({ ...fields, ...eventFields, id: row.id, spent_on: date, household_id: data.household.id, created_by: me });
    setBusy(false);
    if (error && isOfflineError(error)) {
      queueExpense(me, row);
      onSaved?.();
      toast('Sin conexión: guardado en el móvil. Se subirá solo al volver la conexión.', 'info', { ms: 5000 });
      return onClose();
    }
    if (error) return setError(errorMessage(error));
    notifyNewExpenses([row.id]);
    onSaved?.();
    const ticketSaved = await saveTicketItems(row.id);
    await reload();
    toast(ticketSaved ? `Gasto guardado y ${ticketSaved} ${ticketSaved === 1 ? 'producto' : 'productos'} con su precio en la compra` : 'Gasto guardado');
    onClose();
  }

  /** Guarda en la compra los productos del ticket marcados. Devuelve cuántos (0 si no hay o falla). */
  async function saveTicketItems(expenseId: string): Promise<number> {
    if (!shopping || !saveTicket || ticketCount === 0) return 0;
    const on = (key: number) => !ticketSkipped.has(key);
    const existing = Object.fromEntries(ticketMatches.filter((m) => on(m.line)).map((m) => [m.itemId, { cents: ticketLines[m.line].cents, ticketName: ticketLines[m.line].name }]));
    const newItems = ticketFresh.filter((f) => on(f.line)).map((f) => ({
      id: crypto.randomUUID(), name: (ticketNames[f.line] ?? '').trim() || f.name,
      quantity: f.quantity, category: f.category, cents: f.cents, ticketName: f.ticketName,
    }));
    const r = await shopping.recordTicket({ expenseId, existing, newItems });
    if (!r.ok) {
      toast(`El gasto está guardado, pero no los productos del ticket: ${r.message}`, 'info', { ms: 5000 });
      return 0;
    }
    return ticketCount;
  }

  async function remove() {
    if (expense && isQueued(expense.id)) {
      removeQueued(expense.id);
      toast('Gasto borrado');
      return onClose();
    }
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
  const splitSummary = partner ? splitLabel(choiceOf(split), myName, partner.display_name) : '';
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
        {expense && <ReactionPicker data={data} me={me} reload={reload} expense={expense} />}
        {expense?.recurring_id && (
          <Notice icon="repeat">Lo apuntó un gasto fijo. Los cambios aquí solo afectan a este gasto.</Notice>
        )}
        {boughtHere.length > 0 && (
          <details className="card expense-bought">
            <summary className="row">
              <Icon name="cart" size={18} />
              <span className="grow strong">Lo que se compró ({boughtHere.length})</span>
              <Icon name="chevronDown" size={18} />
            </summary>
            <ul className="expense-items">
              {boughtHere.map((i) => (
                <li key={i.id}>
                  <span className="grow">
                    {i.name}
                    {formatQuantity(i.quantity, i.unit) && <span className="muted"> · {formatQuantity(i.quantity, i.unit)}</span>}
                  </span>
                  {i.price_cents != null && <span className="muted">{formatEuros(i.price_cents)}</span>}
                </li>
              ))}
            </ul>
          </details>
        )}

        {prefill && (
          <Notice icon="card">Pago con Apple Pay{prefill.amountCents == null ? '. No se ha entendido el importe: escríbelo tú.' : '. Revisa los datos y guárdalo.'}</Notice>
        )}

        <AmountField label="Importe" value={amount} onChange={(v) => { setAmount(v); setBadAmount(false); }} invalid={badAmount} autoFocus={!source && (!prefill || prefill.amountCents == null)} />

        {quick.length > 0 && (
          <div className="stack-sm">
            <span className="field-label">Habituales</span>
            <div className="chips" role="group" aria-label="Gastos habituales">
              {quick.map((h) => {
                const label = h.note || activeCategories.find((c) => c.id === h.categoryId)?.name || 'Gasto';
                return (
                  <button key={h.key} type="button" className={'chip' + (filledFrom === h.key ? ' selected' : '')} onClick={() => applyHabitual(h)}>
                    {label} · {formatEuros(h.amountCents)}
                  </button>
                );
              })}
            </div>
            {filledFrom && <p className="field-hint">Rellenado como la última vez. Cambia lo que quieras y pulsa Guardar.</p>}
          </div>
        )}

        {!source && <ScanReceipt onResult={applyScan} />}
        {scanned && <Notice kind="success">{scanned}</Notice>}
        {!source && !frequency && shopping && ticketRows.length > 0 && (
          <div className="card stack-sm">
            <label className="check-line">
              <input type="checkbox" checked={saveTicket} onChange={(e) => setSaveTicket(e.target.checked)} />
              <span className="strong">Guardar los productos en la compra ({ticketCount})</span>
            </label>
            <p className="field-hint">
              Cada uno con su precio: lo que está en tu lista se marca como comprado y lo demás se añade nuevo. Así la app sabe lo que cuesta cada cosa y dónde sale más barato.
            </p>
            {saveTicket && (
              <TicketItems
                rows={ticketRows}
                skipped={ticketSkipped}
                names={ticketNames}
                onToggle={(key) => setTicketSkipped((prev) => {
                  const next = new Set(prev);
                  if (!next.delete(key)) next.add(key);
                  return next;
                })}
                onRename={(key, name) => setTicketNames((prev) => ({ ...prev, [key]: name }))}
              />
            )}
          </div>
        )}

        <div className="field">
          <label className="field-label" htmlFor={formId + '-note'}>Concepto <span className="faint">(opcional)</span></label>
          <input
            id={formId + '-note'}
            maxLength={200}
            enterKeyHint="done"
            value={note}
            onChange={(e) => changeNote(e.target.value)}
            placeholder={frequency ? 'Ej.: alquiler' : 'Ej.: compra semanal'}
          />
          {suggested && <p className="field-hint suggest-hint"><Icon name="sparkles" size={14} /><span>{suggested} Puedes cambiarlo.</span></p>}
        </div>

        <fieldset className="category-picker">
          <legend className="field-label">Categoría</legend>
          {activeCategories.length === 0 ? (
            <p className="muted small">No hay categorías. Crea una en Ajustes.</p>
          ) : (
            <div className="category-grid">
              {activeCategories.map((c) => (
                <label key={c.id} className={categoryId === c.id ? 'selected' : ''}>
                  <input type="radio" name={formId + '-cat'} checked={categoryId === c.id} onChange={() => { touched.current.category = true; setCategoryId(c.id); }} />
                  <CategoryIcon name={c.name} size="sm" />
                  <span className="cat-name">{c.name}</span>
                </label>
              ))}
            </div>
          )}
        </fieldset>

        {payers.length > 1 && (
          <div className="payer-picker">
            <Segmented
              legend="¿Quién pagó?"
              value={paidBy}
              options={payers.map((id) => ({
                value: id,
                label: <><Avatar members={data.members} userId={id} />{id === me ? 'Yo' : nameOf(data.members, id, me)}</>,
              }))}
              onChange={(id) => { touched.current.paidBy = true; setPaidBy(id); }}
            />
          </div>
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

        {events.length > 0 && !frequency && (
          <div className="field">
            <label className="field-label" htmlFor={formId + '-event'}>Viaje o evento</label>
            <select id={formId + '-event'} value={eventId} onChange={(e) => setEventId(e.target.value)}>
              <option value="">Ninguno</option>
              {events.map((ev) => (
                <option key={ev.id} value={ev.id}>{ev.name}{eventDates(ev) ? ` (${eventDates(ev)})` : ''}</option>
              ))}
            </select>
          </div>
        )}

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
                split={split}
                oldSplit={oldSplit}
                amountCents={parseEuros(amount) ?? 0}
                myName={myName}
                partnerName={partner.display_name}
                payerIsMe={paidBy === me}
                onChange={(s) => { touched.current.split = true; setSplit(s); }}
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

function splitLabel(choice: SplitChoice, myName: string, partnerName: string): string {
  if (choice === 'equal') return 'A medias';
  if (choice === 'mine') return `Todo de ${myName}`;
  if (choice === 'theirs') return `Todo de ${partnerName}`;
  return 'Reparto especial';
}

/** A medias, todo de uno o todo del otro. «Todo de X» = el gasto le corresponde entero a X. */
function SplitPicker({ split, oldSplit, amountCents, myName, partnerName, payerIsMe, onChange }: {
  split: SplitState;
  oldSplit: SplitState;
  amountCents: number;
  myName: string;
  partnerName: string;
  payerIsMe: boolean;
  onChange: (s: SplitState) => void;
}) {
  const choice = choiceOf(split);
  const hadCustom = choiceOf(oldSplit) === 'custom';

  let hint: string;
  if (choice === 'equal') hint = 'Cada uno asume la mitad.';
  else if (choice === 'mine') hint = payerIsMe ? 'Es solo tuyo y lo pagas tú: entre vosotros no cambia nada.' : `Es solo tuyo y lo paga ${partnerName}: cuenta entero para quedar en paz.`;
  else if (choice === 'theirs') hint = payerIsMe ? `Es solo de ${partnerName} y lo pagas tú: cuenta entero para quedar en paz.` : `Es solo de ${partnerName} y lo paga ${partnerName}: entre vosotros no cambia nada.`;
  else hint = `Este gasto tiene un reparto especial de antes (tu parte: ${customShare(split, amountCents)}). Se queda así salvo que elijas otra opción.`;

  return (
    <div className="stack-sm">
      <Segmented
        legend="¿De quién es el gasto?"
        value={choice}
        options={[
          { value: 'equal', label: 'A medias' },
          { value: 'mine', label: `Todo de ${myName}` },
          { value: 'theirs', label: `Todo de ${partnerName}` },
        ]}
        onChange={(c) => c !== 'custom' && onChange(splitForChoice(c))}
      />
      <p className="field-hint">{hint}</p>
      {hadCustom && choice !== 'custom' && (
        <div className="chips">
          <button type="button" className="chip" onClick={() => onChange(oldSplit)}>Dejar el reparto de antes</button>
        </div>
      )}
    </div>
  );
}

function customShare(split: SplitState, amountCents: number): string {
  if (split.mode === 'percent') return `${formatPercent(Number(split.myShare.replace(',', '.')))} %`;
  const mine = parseEuros(split.myShare, { allowZero: true });
  return mine != null && mine <= amountCents ? formatEuros(mine) : `${split.myShare} €`;
}
