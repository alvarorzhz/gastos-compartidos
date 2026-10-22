import { useId, useMemo, useState, type FormEvent } from 'react';
import { addDays, formatShortDay, today } from '../lib/dates';
import { currentEvent } from '../lib/events';
import { centsToInput, formatEuros, parseEuros } from '../lib/money';
import { nameOf } from '../lib/people';
import { notifyNewExpenses } from '../lib/push';
import type { ReceiptGuess } from '../lib/receipt';
import { currentBought, formatQuantity } from '../lib/shopping';
import { lastPrice, matchTicket, prettyTicketName, shoppingCategory } from '../lib/shoppingPrices';
import { defaultSplit, owedFromSplit } from '../lib/split';
import { errorMessage, supabase } from '../lib/supabase';
import type { ListItem, Shopping } from '../lib/useShopping';
import { AmountField, Avatar, Notice, Segmented, Sheet, toast, type ViewProps } from './common';
import { Icon } from './icons';
import ScanReceipt from './ScanReceipt';

/*
 * Terminar la compra. Lo normal es escanear el ticket: la app rellena el total, la tienda y la
 * fecha, y empareja cada producto comprado con su línea del ticket para guardar lo que costó.
 * Con eso se apunta el gasto común (con el reparto de siempre) y la compra pasa al historial.
 * También se puede escribir el total a mano o terminar sin apuntar gasto.
 * No hace falta haberlo marcado todo: lo que no se marque se queda en la lista para la próxima.
 */

export default function FinishTripSheet({ data, me, reload, shopping, items, onClose }: ViewProps & {
  shopping: Shopping;
  items: ListItem[];
  onClose: () => void;
}) {
  const formId = useId();
  const marked = useMemo(() => currentBought(items.filter((i) => !i.unsaved)), [items]);
  const pending = useMemo(() => items.filter((i) => i.status === 'pending' && !i.unsaved), [items]);
  /** Pendientes de la lista que también se han comprado (marcados aquí o encontrados en el ticket). */
  const [extra, setExtra] = useState<string[]>([]);
  const bought = useMemo(() => [...marked, ...pending.filter((i) => extra.includes(i.id))], [marked, pending, extra]);
  const pendingCount = pending.length - pending.filter((i) => extra.includes(i.id)).length;
  const activeCategories = data.categories.filter((c) => !c.archived);
  const [guess, setGuess] = useState<ReceiptGuess | null>(null);
  const [total, setTotal] = useState('');
  const [badTotal, setBadTotal] = useState(false);
  const [date, setDate] = useState(today());
  const [paidBy, setPaidBy] = useState(me);
  const [categoryId, setCategoryId] = useState(() => shoppingCategory(data.categories, data.expenses, items)?.id ?? '');
  const [note, setNote] = useState('Compra');
  const [prices, setPrices] = useState<Record<string, string>>({});
  /** Línea del ticket elegida para cada producto (-1 = ninguna). */
  const [lineOf, setLineOf] = useState<Record<string, number>>({});
  const [pricesOpen, setPricesOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Si el gasto se guardó pero falló terminar la compra, al reintentar no se apunta otra vez.
  const [savedExpense, setSavedExpense] = useState<string | null>(null);

  const lines = guess?.lines ?? [];
  const usedLines = new Set(Object.values(lineOf).filter((l) => l >= 0));
  const loose = lines.map((l, idx) => ({ ...l, idx })).filter((l) => !usedLines.has(l.idx) && l.cents > 0);
  const pricedSum = bought.reduce((a, i) => a + (parseEuros(prices[i.id] ?? '') ?? 0), 0);
  const pricedCount = bought.filter((i) => parseEuros(prices[i.id] ?? '') != null).length;
  const payers = data.members.map((m) => m.user_id);

  function applyScan(g: ReceiptGuess) {
    setGuess(g);
    if (g.amountCents != null) {
      setTotal(centsToInput(g.amountCents));
      setBadTotal(false);
    }
    // La fecha del ticket solo si es de estos días: una fecha mal leída no manda el gasto a otro mes.
    if (g.date && g.date >= addDays(today(), -14)) setDate(g.date);
    if (g.merchant) setNote(`Compra en ${g.merchant}`);
    const cat = g.categoryName && activeCategories.find((c) => c.name.toLowerCase() === g.categoryName!.toLowerCase());
    if (cat) setCategoryId(cat.id);
    // También se buscan en el ticket los que siguen pendientes: si aparecen, se compraron aunque no se marcaran.
    const matches = matchTicket([...marked, ...pending], g.lines, items);
    const found = matches.map((m) => m.itemId).filter((id) => pending.some((i) => i.id === id));
    if (found.length) setExtra((prev) => [...new Set([...prev, ...found])]);
    const nextLine: Record<string, number> = {};
    const nextPrices: Record<string, string> = { ...prices };
    for (const m of matches) {
      nextLine[m.itemId] = m.line;
      nextPrices[m.itemId] = centsToInput(g.lines[m.line].cents);
    }
    setLineOf(nextLine);
    setPrices(nextPrices);
    if (matches.length < marked.length) setPricesOpen(true);
  }

  function toggleExtra(id: string) {
    setExtra((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  function chooseLine(itemId: string, idx: number) {
    setLineOf((prev) => ({ ...prev, [itemId]: idx }));
    if (idx >= 0) setPrices((prev) => ({ ...prev, [itemId]: centsToInput(lines[idx].cents) }));
  }

  /** Precios de cada producto para guardar; null si alguno está mal escrito. */
  function collectPrices(): Record<string, { cents: number | null; ticketName: string | null }> | null {
    const out: Record<string, { cents: number | null; ticketName: string | null }> = {};
    for (const i of bought) {
      const text = (prices[i.id] ?? '').trim();
      const cents = text ? parseEuros(text) : null;
      if (text && cents == null) return null;
      const line = lineOf[i.id] ?? -1;
      const ticketName = line >= 0 ? lines[line]?.name ?? null : null;
      if (cents != null || ticketName) out[i.id] = { cents, ticketName };
    }
    return out;
  }

  async function finish(withExpense: boolean) {
    setError(null);
    const priceMap = collectPrices();
    if (!priceMap) {
      setPricesOpen(true);
      return setError('Algún precio de los productos no es válido. Escríbelo así: 2,35');
    }
    // Lo que se ha comprado sin marcar se marca ahora, antes de apuntar nada.
    const toMark = pending.filter((i) => extra.includes(i.id));
    setBusy(true);
    for (const i of toMark) {
      const r = await shopping.setBought(i, true, me);
      if (!r.ok) {
        setBusy(false);
        return setError(`No se ha podido marcar «${i.name}» como comprado: ${r.message}`);
      }
    }
    setBusy(false);
    let expenseId = savedExpense;
    if (withExpense && !expenseId) {
      const cents = parseEuros(total);
      setBadTotal(cents == null);
      if (cents == null) return setError(total.trim() ? 'Ese total no es válido. Escríbelo así: 29,42' : 'Escribe cuánto ha costado la compra o escanea el ticket.');
      if (!categoryId) return setError('Elige una categoría para el gasto.');
      const owed = owedFromSplit(defaultSplit(data.household, me, data.members), cents, paidBy === me);
      if (owed === 'invalid') return setError('El reparto por defecto no es válido. Revísalo en Ajustes.');
      const event = currentEvent(data.events, date);
      setBusy(true);
      const id = crypto.randomUUID();
      const { error } = await supabase.from('expenses').insert({
        id, household_id: data.household.id, amount_cents: cents, spent_on: date, category_id: categoryId,
        paid_by: paidBy, owed_cents: owed, note: note.trim().slice(0, 200) || null, created_by: me,
        ...(event ? { event_id: event.id } : {}),
      });
      if (error) {
        setBusy(false);
        return setError(`No se ha podido apuntar el gasto: ${errorMessage(error)}. Revisa la conexión y vuelve a intentarlo.`);
      }
      expenseId = id;
      setSavedExpense(id);
      notifyNewExpenses([id]);
    }
    setBusy(true);
    const r = await shopping.finishTrip({ expenseId, prices: priceMap, alsoBought: extra });
    setBusy(false);
    if (!r.ok) {
      return setError(expenseId
        ? `El gasto ya está apuntado, pero no se ha podido terminar la compra: ${r.message}. Pulsa otra vez para reintentarlo (no se apunta dos veces).`
        : `No se ha podido terminar la compra: ${r.message}`);
    }
    if (expenseId) {
      await reload();
      toast(`Compra terminada y gasto apuntado: ${formatEuros(parseEuros(total) ?? 0)}`);
    } else {
      toast('Compra terminada. ¡Lista para la próxima!');
    }
    onClose();
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    void finish(true);
  }

  const summary = guess && (
    <Notice kind={guess.linesMatchTotal ? 'success' : 'info'} icon={guess.linesMatchTotal ? 'check' : 'receipt'}>
      {[guess.merchant, guess.date && formatShortDay(guess.date)].filter(Boolean).join(' · ') || 'Ticket leído'}
      {guess.lines.length > 0 ? `: ${guess.lines.length} productos leídos.` : '.'}
      {guess.linesMatchTotal
        ? ' La suma de los productos cuadra con el total.'
        : guess.lines.length > 0
          ? ' La suma no cuadra con el total: revisa el total y los precios antes de guardar.'
          : ' Revisa el total antes de guardar.'}
    </Notice>
  );

  return (
    <Sheet
      title="Terminar la compra"
      subtitle={`${bought.length} ${bought.length === 1 ? 'producto comprado' : 'productos comprados'}${pendingCount ? ` · ${pendingCount} se quedan en la lista` : ''}`}
      onClose={onClose}
      footer={
        <>
          {error && <p className="error" role="alert">{error}</p>}
          <div className="row">
            {!savedExpense && bought.length > 0 && (
              <button type="button" className="secondary" onClick={() => void finish(false)} disabled={busy}>Sin gasto</button>
            )}
            <button type="submit" form={formId} className="primary lg" disabled={busy}>
              {busy ? 'Guardando…' : savedExpense ? 'Reintentar' : 'Apuntar gasto y terminar'}
            </button>
          </div>
        </>
      }
    >
      <form id={formId} className="stack" onSubmit={submit} noValidate>
        <ScanReceipt onResult={applyScan} primary={!guess} label={guess ? 'Escanear otra vez' : 'Escanear el ticket'} />
        {summary}

        <AmountField label="Total de la compra" value={total} onChange={(v) => { setTotal(v); setBadTotal(false); }} invalid={badTotal} />
        {!guess && pricedCount > 0 && pricedCount === bought.length && !total.trim() && (
          <button type="button" className="chip" onClick={() => setTotal(centsToInput(pricedSum))}>Usar la suma de los precios: {formatEuros(pricedSum)}</button>
        )}

        {payers.length > 1 && (
          <Segmented
            legend="¿Quién ha pagado?"
            value={paidBy}
            options={payers.map((id) => ({ value: id, label: <><Avatar members={data.members} userId={id} size="sm" />{nameOf(data.members, id, me)}</> }))}
            onChange={setPaidBy}
          />
        )}

        <div className="row">
          <div className="field grow">
            <label className="field-label" htmlFor={formId + '-cat'}>Categoría</label>
            <select id={formId + '-cat'} value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
              {activeCategories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div className="field">
            <label className="field-label" htmlFor={formId + '-date'}>Fecha</label>
            <input id={formId + '-date'} type="date" value={date} max={today()} onChange={(e) => setDate(e.target.value)} />
          </div>
        </div>

        <div className="field">
          <label className="field-label" htmlFor={formId + '-note'}>Concepto</label>
          <input id={formId + '-note'} maxLength={200} value={note} onChange={(e) => setNote(e.target.value)} />
        </div>

        {pending.length > 0 && (
          <div className="field">
            <span className="field-label" id={formId + '-extra'}>¿Habéis cogido algo más de la lista?</span>
            <div className="chips" role="group" aria-labelledby={formId + '-extra'}>
              {pending.map((i) => (
                <button key={i.id} type="button" className={'chip' + (extra.includes(i.id) ? ' selected' : '')} aria-pressed={extra.includes(i.id)} onClick={() => toggleExtra(i.id)}>
                  {extra.includes(i.id) && <Icon name="check" size={14} />} {i.name}
                </button>
              ))}
            </div>
            <p className="field-hint">Toca lo que también hayáis comprado. Lo demás se queda en la lista para la próxima.</p>
          </div>
        )}

        <button type="button" className="disclosure" aria-expanded={pricesOpen} onClick={() => setPricesOpen((v) => !v)}>
          <span>Precio de cada producto</span>
          <span className="row">
            <span className="summary">{pricedCount} de {bought.length}{pricedCount ? ` · ${formatEuros(pricedSum)}` : ''}</span>
            <Icon name="chevronDown" size={18} />
          </span>
        </button>
        {pricesOpen && (
          <div className="stack-sm">
            <p className="field-hint">
              {lines.length
                ? 'Los he emparejado con el ticket. Si alguno no es, elige su línea. La app recordará los precios y el nombre en el ticket para la próxima vez.'
                : 'Opcional. Con los precios, la app calcula cuánto costará la próxima lista. Más fácil: escanea el ticket.'}
            </p>
            <ul className="finish-prices">
              {bought.map((i) => {
                const last = lastPrice(i.name, items.filter((x) => x.id !== i.id));
                const line = lineOf[i.id] ?? -1;
                return (
                  <li key={i.id} className="finish-price-row">
                    <div className="row">
                      <span className="row-main">
                        <span className="row-title">{i.name}</span>
                        <span className="row-meta">{[formatQuantity(i.quantity, i.unit), last && `la última vez ${formatEuros(last.cents)}`].filter(Boolean).join(' · ')}</span>
                      </span>
                      <input
                        className="price-input"
                        aria-label={`Precio de ${i.name}`}
                        inputMode="decimal"
                        placeholder={last ? centsToInput(last.cents) : '0,00'}
                        value={prices[i.id] ?? ''}
                        onChange={(e) => setPrices((prev) => ({ ...prev, [i.id]: e.target.value }))}
                      />
                    </div>
                    {lines.length > 0 && (
                      <select
                        className="select-pill"
                        aria-label={`Línea del ticket para ${i.name}`}
                        value={line}
                        onChange={(e) => chooseLine(i.id, Number(e.target.value))}
                      >
                        <option value={-1}>En el ticket: sin elegir</option>
                        {lines.map((l, idx) => (l.cents > 0 && (idx === line || !usedLines.has(idx))) && (
                          <option key={idx} value={idx}>En el ticket: {prettyTicketName(l.name)} · {formatEuros(l.cents)}</option>
                        ))}
                      </select>
                    )}
                  </li>
                );
              })}
            </ul>
            {loose.length > 0 && (
              <details className="finish-loose">
                <summary className="muted small">En el ticket pero no en la lista ({loose.length})</summary>
                <ul>
                  {loose.map((l) => (
                    <li key={l.idx} className="row small"><span className="grow">{prettyTicketName(l.name)}</span><span className="muted">{formatEuros(l.cents)}</span></li>
                  ))}
                </ul>
              </details>
            )}
          </div>
        )}
        <p className="field-hint">
          Se apunta como gasto común con el reparto de siempre (lo puedes cambiar después en Gastos). Lo comprado pasa al historial; no se borra nada.
        </p>
      </form>
    </Sheet>
  );
}
