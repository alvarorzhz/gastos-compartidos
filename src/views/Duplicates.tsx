import { useMemo, useState } from 'react';
import { today } from '../lib/dates';
import { dismissDuplicate, dismissedDuplicates, findDuplicates, mergedFields, pairKey, type DuplicatePair } from '../lib/duplicates';
import { isQueued } from '../lib/expenseOutbox';
import { formatEuros } from '../lib/money';
import { errorMessage, supabase } from '../lib/supabase';
import type { Expense } from '../lib/types';
import { toast, type ViewProps } from './common';
import { ExpenseRow } from './ExpenseRow';
import { Icon } from './icons';
import { deleteWithUndo } from './undo';

/**
 * «¿Es el mismo gasto?»: cuando un pago parece apuntado dos veces (Apple Pay y ticket, o cada
 * uno por su lado), lo enseña y deja unirlo en uno o decir que no son el mismo.
 */
export default function Duplicates({ data, me, reload, onOpen }: ViewProps & { onOpen: (e: Expense) => void }) {
  const [dismissed, setDismissed] = useState(dismissedDuplicates);
  const [busy, setBusy] = useState(false);
  const pairs = useMemo(
    () => findDuplicates(data.expenses.filter((e) => !isQueued(e.id)), today(), dismissed),
    [data.expenses, dismissed],
  );
  if (pairs.length === 0) return null;
  const { keep, drop } = pairs[0];

  function notSame(p: DuplicatePair) {
    dismissDuplicate(pairKey(p.keep.id, p.drop.id));
    setDismissed(dismissedDuplicates());
  }

  async function merge(p: DuplicatePair) {
    setBusy(true);
    const fields = mergedFields(p.keep, p.drop);
    if (Object.keys(fields).length > 0) {
      const { error } = await supabase.from('expenses').update(fields).eq('id', p.keep.id);
      if (error) {
        setBusy(false);
        return toast('No se ha podido unir: ' + errorMessage(error), 'error');
      }
    }
    setBusy(false);
    deleteWithUndo({ table: 'expenses', id: p.drop.id, done: 'Unidos en un solo gasto', reload });
  }

  const sameAuthor = keep.created_by === drop.created_by;
  return (
    <section className="card stack-sm duplicates" aria-labelledby="duplicates-title">
      <h2 id="duplicates-title" className="row stat-label"><Icon name="alert" size={16} /> ¿Es el mismo gasto?</h2>
      <p className="muted small">
        {sameAuthor
          ? `Hay dos gastos de ${formatEuros(keep.amount_cents)} casi iguales. Si es el mismo pago apuntado dos veces, únelos y el saldo quedará bien.`
          : `Los dos habéis apuntado ${formatEuros(keep.amount_cents)} casi a la vez. Si es el mismo pago, únelos.`}
        {pairs.length > 1 && ` (Hay ${pairs.length - 1} más.)`}
      </p>
      <ul className="list with-icons">
        <ExpenseRow expense={keep} data={data} me={me} onOpen={onOpen} showDate />
        <ExpenseRow expense={drop} data={data} me={me} onOpen={onOpen} showDate />
      </ul>
      <div className="row" style={{ justifyContent: 'flex-end' }}>
        <button className="sm secondary" onClick={() => notSame(pairs[0])} disabled={busy}>No son el mismo</button>
        <button className="sm primary" onClick={() => void merge(pairs[0])} disabled={busy}>
          {busy ? 'Uniendo…' : 'Unir en uno'}
        </button>
      </div>
    </section>
  );
}
