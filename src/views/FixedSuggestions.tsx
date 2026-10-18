import { useMemo, useState } from 'react';
import { formatDay, today } from '../lib/dates';
import { dismissCandidate, dismissedCandidates, fixedCandidates, type FixedCandidate } from '../lib/fixedCandidates';
import { formatEuros } from '../lib/money';
import { errorMessage, supabase } from '../lib/supabase';
import { CategoryIcon, toast, type ViewProps } from './common';
import { Icon } from './icons';

/**
 * "Parece que esto se repite cada mes": propone convertir en gasto fijo lo que ya apuntáis a
 * mano todos los meses (o viene así en el extracto), para que se apunte solo.
 */
export default function FixedSuggestions({ data, me, reload }: ViewProps) {
  const [hidden, setHidden] = useState(dismissedCandidates);
  const [busy, setBusy] = useState<string | null>(null);
  const candidates = useMemo(
    () => fixedCandidates(data.expenses, data.recurring, today(), hidden, 3),
    [data.expenses, data.recurring, hidden],
  );
  if (candidates.length === 0) return null;

  const categoryName = (id: string) => data.categories.find((c) => c.id === id)?.name ?? 'Otros';
  const isMember = (id: string) => data.members.some((m) => m.user_id === id);

  function dismiss(c: FixedCandidate) {
    dismissCandidate(c.key);
    setHidden(dismissedCandidates());
  }

  async function makeFixed(c: FixedCandidate) {
    setBusy(c.key);
    const paidBy = isMember(c.last.paid_by) ? c.last.paid_by : me;
    const { error } = await supabase.from('recurring_expenses').insert({
      household_id: data.household.id,
      amount_cents: c.amountCents,
      category_id: c.categoryId,
      paid_by: paidBy,
      owed_cents: paidBy === c.last.paid_by ? c.last.owed_cents : null,
      note: c.note,
      frequency: 'monthly',
      start_on: c.startOn,
      created_by: me,
    });
    setBusy(null);
    if (error) return toast(errorMessage(error), 'error');
    await reload();
    toast(`${c.note} se apuntará solo cada mes`);
  }

  return (
    <section className="card stack-sm fixed-suggestions" aria-labelledby="fixed-suggestions">
      <h2 id="fixed-suggestions" className="row stat-label"><Icon name="sparkles" size={16} /> Esto parece un gasto fijo</h2>
      <p className="muted small">Lo apuntáis cada mes. Si lo hacéis fijo, la app lo apuntará sola en su fecha.</p>
      <ul className="list with-icons">
        {candidates.map((c) => (
          <li key={c.key}>
            <div className="row-item">
              <CategoryIcon name={categoryName(c.categoryId)} />
              <span className="row-main">
                <span className="row-title">{c.note} · {formatEuros(c.amountCents)}</span>
                <span className="row-meta">{c.months} meses seguidos · próximo: {formatDay(c.startOn)}</span>
              </span>
            </div>
            <div className="row" style={{ justifyContent: 'flex-end', paddingBottom: 'var(--s2)' }}>
              <button className="sm secondary" onClick={() => dismiss(c)} disabled={busy != null}>No</button>
              <button className="sm primary" onClick={() => void makeFixed(c)} disabled={busy != null}>
                <Icon name="repeat" size={16} /> {busy === c.key ? 'Guardando…' : 'Hacer fijo'}
              </button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
