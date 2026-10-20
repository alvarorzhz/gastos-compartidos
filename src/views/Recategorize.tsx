import { useId, useState } from 'react';
import { formatShortDay } from '../lib/dates';
import { formatEuros } from '../lib/money';
import { categoryOptions, dismissProposals, type CategoryProposal } from '../lib/personal';
import { errorMessage, supabase } from '../lib/supabase';
import { CategoryIcon, Sheet, toast, type ViewProps } from './common';

/** Pasa a su categoría los gastos personales que estaban en «Otros». Nada cambia sin tu visto bueno. */
export default function Recategorize({ data, reload, proposals, onClose }: ViewProps & { proposals: CategoryProposal[]; onClose: () => void }) {
  const [chosen, setChosen] = useState<Record<string, string | null>>(() => Object.fromEntries(proposals.map((p) => [p.entry.id, p.category])));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const options = categoryOptions(data.personal, 'expense').filter((c) => c !== 'Otros');
  const listId = useId();

  const picked = proposals.filter((p) => chosen[p.entry.id]);
  const left = proposals.filter((p) => !chosen[p.entry.id]);

  async function apply() {
    setBusy(true);
    setError(null);
    const byCategory = new Map<string, string[]>();
    for (const p of picked) {
      const c = chosen[p.entry.id]!.trim().slice(0, 40);
      byCategory.set(c, [...(byCategory.get(c) ?? []), p.entry.id]);
    }
    for (const [category, ids] of byCategory) {
      const { error } = await supabase.from('personal_entries').update({ category }).in('id', ids);
      if (error) {
        setBusy(false);
        await reload();
        return setError(errorMessage(error));
      }
    }
    // Lo desmarcado se queda en «Otros» y no se vuelve a proponer.
    dismissProposals(left.map((p) => p.entry.id));
    await reload();
    setBusy(false);
    toast(picked.length === 1 ? 'Gasto cambiado de categoría' : `${picked.length} gastos cambiados de categoría`);
    onClose();
  }

  return (
    <Sheet
      title="Ordenar «Otros»"
      subtitle="Estos gastos están en «Otros» y parecen de otra categoría. Desmarca los que no, o cambia la categoría."
      onClose={onClose}
      footer={
        <>
          {error && <p className="error" role="alert">{error}</p>}
          <button type="button" className="primary lg" onClick={() => void apply()} disabled={busy}>
            {busy ? 'Guardando…' : picked.length === 0 ? 'Dejar todos en «Otros»' : `Cambiar ${picked.length} ${picked.length === 1 ? 'gasto' : 'gastos'}`}
          </button>
        </>
      }
    >
      <datalist id={listId}>{options.map((o) => <option key={o} value={o} />)}</datalist>
      <ul className="list with-icons review-list">
        {proposals.map((p) => {
          const value = chosen[p.entry.id];
          return (
            <li key={p.entry.id}>
              <div className="row-item">
                <input
                  type="checkbox"
                  className="cancel-check"
                  checked={value != null}
                  onChange={(e) => setChosen({ ...chosen, [p.entry.id]: e.target.checked ? p.category : null })}
                  aria-label={`Cambiar ${p.entry.note}`}
                />
                <CategoryIcon name={value ?? 'Otros'} />
                <span className="row-main">
                  <span className="row-title">{p.entry.note}</span>
                  <span className="row-meta">{formatShortDay(p.entry.entry_on)} · {formatEuros(p.entry.amount_cents)}{p.reason === 'learned' ? ' · como otras veces' : ''}</span>
                  {value != null && (
                    <input
                      className="recat-input"
                      list={listId}
                      maxLength={40}
                      value={value}
                      onChange={(e) => setChosen({ ...chosen, [p.entry.id]: e.target.value })}
                      onBlur={(e) => { if (!e.target.value.trim()) setChosen({ ...chosen, [p.entry.id]: null }); }}
                      aria-label={`Categoría de ${p.entry.note}`}
                    />
                  )}
                </span>
              </div>
            </li>
          );
        })}
      </ul>
    </Sheet>
  );
}
