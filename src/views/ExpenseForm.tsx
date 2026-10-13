import { useState, type FormEvent } from 'react';
import { today } from '../lib/dates';
import { centsToInput, formatEuros, parseEuros } from '../lib/money';
import { nameOf, partnerOf } from '../lib/people';
import { owedFromSplit, splitFromExpense, type SplitMode } from '../lib/split';
import { errorMessage, supabase } from '../lib/supabase';
import type { Expense } from '../lib/types';
import { Sheet, type ViewProps } from './common';

interface Props extends ViewProps {
  expense: Expense | null; // null = nuevo
  onClose: () => void;
}

export default function ExpenseForm({ data, me, reload, expense, onClose }: Props) {
  const activeCategories = data.categories.filter((c) => !c.archived || c.id === expense?.category_id);
  const [amount, setAmount] = useState(expense ? centsToInput(expense.amount_cents) : '');
  const [date, setDate] = useState(expense?.spent_on ?? today());
  const [categoryId, setCategoryId] = useState(expense?.category_id ?? activeCategories[0]?.id ?? '');
  const [paidBy, setPaidBy] = useState(expense?.paid_by ?? me);
  const [note, setNote] = useState(expense?.note ?? '');
  const [split, setSplit] = useState(() => splitFromExpense(expense, me));
  const partner = partnerOf(data.members, me);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
    setBusy(true);
    setError(null);
    const fields = { amount_cents: cents, spent_on: date, category_id: categoryId, paid_by: paidBy, owed_cents: owed, note: note.trim() || null };
    const { error } = expense
      ? await supabase.from('expenses').update(fields).eq('id', expense.id)
      : await supabase.from('expenses').insert({ ...fields, household_id: data.household.id, created_by: me });
    setBusy(false);
    if (error) return setError(errorMessage(error));
    await reload();
    onClose();
  }

  async function remove() {
    if (!expense || !confirm('¿Borrar este gasto?')) return;
    setBusy(true);
    const { error } = await supabase.from('expenses').delete().eq('id', expense.id);
    setBusy(false);
    if (error) return setError(errorMessage(error));
    await reload();
    onClose();
  }

  return (
    <Sheet title={expense ? 'Editar gasto' : 'Nuevo gasto'} onClose={onClose}>
      <form onSubmit={save} className="stack">
        <label>
          Importe (€)
          <input
            className="amount-input"
            inputMode="decimal"
            autoFocus={!expense}
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
        <label>
          Fecha
          <input type="date" required value={date} onChange={(e) => setDate(e.target.value)} />
        </label>
        <label>
          Nota (opcional)
          <input maxLength={200} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Ej.: compra semanal" />
        </label>
        {error && <p className="error">{error}</p>}
        <div className="row">
          {expense && (
            <button type="button" className="danger" onClick={remove} disabled={busy}>Borrar</button>
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
