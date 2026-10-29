import { useMemo, useState } from 'react';
import { suggestBudgets, type BudgetSuggestion } from '../lib/budgetSuggest';
import { formatEuros } from '../lib/money';
import { errorMessage, supabase } from '../lib/supabase';
import { CategoryIcon, toast, type ViewProps } from './common';
import { Icon } from './icons';

const SEEN_KEY = 'gastos.limitesPropuestos';

function dismissedMonth(): string | null {
  try {
    return localStorage.getItem(SEEN_KEY);
  } catch {
    return null;
  }
}

function reasonText(s: BudgetSuggestion): string {
  if (s.reason === 'new') return 'Ahora sin límite';
  if (s.reason === 'over') return 'Os pasáis casi siempre';
  return 'Os sobra todos los meses';
}

/**
 * «Límites a vuestra medida»: propone límites según lo que gastáis de verdad los últimos
 * 3 meses. Se aceptan uno a uno o todos a la vez, y «Ahora no» lo esconde hasta el mes siguiente.
 */
export default function BudgetSuggestions({ data, reload, month }: ViewProps & { month: string }) {
  const [hiddenMonth, setHiddenMonth] = useState(dismissedMonth);
  const [busy, setBusy] = useState<string | null>(null);
  const suggestions = useMemo(
    () => suggestBudgets(month, data.categories, data.expenses, data.budgets).slice(0, 5),
    [month, data.categories, data.expenses, data.budgets],
  );
  if (suggestions.length === 0 || hiddenMonth === month) return null;

  function later() {
    try {
      localStorage.setItem(SEEN_KEY, month);
    } catch {
      // Sin almacenamiento: se volverá a enseñar, sin más.
    }
    setHiddenMonth(month);
  }

  async function apply(list: BudgetSuggestion[], key: string) {
    setBusy(key);
    const { error } = await supabase
      .from('budgets')
      .upsert(list.map((s) => ({ household_id: data.household.id, category_id: s.category.id, month, amount_cents: s.suggestedCents })));
    setBusy(null);
    if (error) return toast('No se ha podido guardar: ' + errorMessage(error), 'error');
    await reload();
    toast(list.length === 1 ? `Límite de ${list[0].category.name} guardado` : 'Límites guardados');
  }

  return (
    <section className="card stack-sm budget-suggestions" aria-labelledby="budget-suggestions">
      <h2 id="budget-suggestions" className="row stat-label"><Icon name="sparkles" size={16} /> Límites a vuestra medida</h2>
      <p className="muted small">
        Según lo que habéis gastado de verdad los últimos 3 meses. Valen desde este mes y podéis cambiarlos cuando queráis.
      </p>
      <ul className="list with-icons">
        {suggestions.map((s) => (
          <li key={s.category.id}>
            <div className="row-item">
              <CategoryIcon name={s.category.name} />
              <span className="row-main">
                <span className="row-title">{s.category.name}</span>
                <span className="row-meta">{reasonText(s)}</span>
              </span>
              <span className="row-end">
                <span className="row-amount">{formatEuros(s.suggestedCents)}</span>
                <span className="row-sub muted">{s.currentCents != null ? `antes ${formatEuros(s.currentCents)}` : 'al mes'}</span>
              </span>
            </div>
            <div className="row" style={{ justifyContent: 'space-between', padding: '0 var(--s4) var(--s3)' }}>
              <span className="muted small">Últimos 3 meses: {s.monthsCents.map((c) => `${Math.round(c / 100)}\u00a0€`).join(' · ')}</span>
              <button className="sm tinted" onClick={() => void apply([s], s.category.id)} disabled={busy != null}>
                {busy === s.category.id ? 'Guardando…' : 'Poner'}
              </button>
            </div>
          </li>
        ))}
      </ul>
      <div className="row" style={{ justifyContent: 'flex-end' }}>
        <button className="sm secondary" onClick={later} disabled={busy != null}>Ahora no</button>
        {suggestions.length > 1 && (
          <button className="sm primary" onClick={() => void apply(suggestions, 'all')} disabled={busy != null}>
            {busy === 'all' ? 'Guardando…' : 'Poner todos'}
          </button>
        )}
      </div>
    </section>
  );
}
