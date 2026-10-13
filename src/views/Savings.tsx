import { useState, type FormEvent } from 'react';
import { formatDay, today } from '../lib/dates';
import { centsToInput, formatEuros, parseEuros } from '../lib/money';
import { nameOf } from '../lib/people';
import { goalProgress } from '../lib/savings';
import { errorMessage, supabase } from '../lib/supabase';
import type { SavingsGoal } from '../lib/types';
import { Sheet, type ViewProps } from './common';

/** Huchas comunes: objetivos de ahorro con lo que aporta cada uno. No cuentan en el saldo. */
export default function Savings(props: ViewProps) {
  const { data, me } = props;
  const [editing, setEditing] = useState<SavingsGoal | 'new' | null>(null);
  const [contributing, setContributing] = useState<SavingsGoal | null>(null);
  const goals = data.goals.filter((g) => !g.archived);

  return (
    <section className="savings">
      <div className="row spread">
        <h3>🐷 Huchas</h3>
        <button className="link small" onClick={() => setEditing('new')}>＋ Nueva hucha</button>
      </div>
      {goals.length === 0 ? (
        <p className="muted small">
          Apartad dinero para algo en común, como un viaje o un sofá. Lo que metáis en una hucha no cuenta en el saldo entre vosotros.
        </p>
      ) : (
        goals.map((g) => {
          const p = goalProgress(g, data.contributions);
          const done = p.savedCents >= g.target_cents;
          return (
            <div key={g.id} className="card goal">
              <div className="row spread">
                <button className="link title-link" onClick={() => setEditing(g)}>{done ? '🎉 ' : ''}{g.name}</button>
                <span>
                  <strong>{formatEuros(p.savedCents)}</strong> <span className="muted">/ {formatEuros(g.target_cents)}</span>
                </span>
              </div>
              <div className={'progress ' + (done ? '' : 'saving')}>
                <div style={{ width: `${Math.max(0, Math.min(p.ratio, 1)) * 100}%` }} />
              </div>
              <div className="row spread small">
                <span className="muted">
                  {[...p.byUser.entries()].map(([u, c]) => `${nameOf(data.members, u, me)}: ${formatEuros(c)}`).join(' · ') || 'Sin aportaciones'}
                </span>
                <span className="muted">{done ? '¡Conseguido!' : `Faltan ${formatEuros(g.target_cents - p.savedCents)}`}</span>
              </div>
              <button className="secondary" onClick={() => setContributing(g)}>Aportar o sacar</button>
            </div>
          );
        })
      )}

      {editing && <GoalForm {...props} goal={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
      {contributing && <ContributionForm {...props} goal={contributing} onClose={() => setContributing(null)} />}
    </section>
  );
}

function GoalForm({ data, me, reload, goal, onClose }: ViewProps & { goal: SavingsGoal | null; onClose: () => void }) {
  const [name, setName] = useState(goal?.name ?? '');
  const [target, setTarget] = useState(goal ? centsToInput(goal.target_cents) : '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const contributions = goal ? data.contributions.filter((c) => c.goal_id === goal.id) : [];

  async function run(p: PromiseLike<{ error: unknown }>) {
    setBusy(true);
    const { error } = await p;
    setBusy(false);
    if (error) {
      setError(errorMessage(error));
      return false;
    }
    await reload();
    return true;
  }

  async function save(e: FormEvent) {
    e.preventDefault();
    const cents = parseEuros(target);
    if (!name.trim()) return setError('Ponle un nombre');
    if (cents == null) return setError('Escribe el objetivo, por ejemplo 1500');
    const fields = { name: name.trim(), target_cents: cents };
    const ok = await run(
      goal
        ? supabase.from('savings_goals').update(fields).eq('id', goal.id)
        : supabase.from('savings_goals').insert({ ...fields, household_id: data.household.id }),
    );
    if (ok) onClose();
  }

  async function remove() {
    if (!goal || !confirm(`¿Borrar la hucha "${goal.name}" y sus aportaciones?`)) return;
    if (await run(supabase.from('savings_goals').delete().eq('id', goal.id))) onClose();
  }

  async function removeContribution(id: string) {
    if (confirm('¿Borrar esta aportación?')) await run(supabase.from('savings_contributions').delete().eq('id', id));
  }

  return (
    <Sheet title={goal ? 'Editar hucha' : 'Nueva hucha'} onClose={onClose}>
      <form onSubmit={save} className="stack">
        <label>
          Nombre
          <input maxLength={60} required autoFocus={!goal} value={name} onChange={(e) => setName(e.target.value)} placeholder="Ej.: Viaje a Italia" />
        </label>
        <label>
          Objetivo (€)
          <input inputMode="decimal" required value={target} onChange={(e) => setTarget(e.target.value)} placeholder="1500" />
        </label>
        {error && <p className="error">{error}</p>}
        <div className="row">
          {goal && <button type="button" className="danger" onClick={remove} disabled={busy}>Borrar</button>}
          {goal && (
            <button type="button" className="secondary" disabled={busy}
              onClick={async () => { if (await run(supabase.from('savings_goals').update({ archived: true }).eq('id', goal.id))) onClose(); }}>
              Archivar
            </button>
          )}
          <button className="primary grow" disabled={busy}>Guardar</button>
        </div>
      </form>
      {contributions.length > 0 && (
        <>
          <h3>Movimientos</h3>
          <ul className="list">
            {contributions.map((c) => (
              <li key={c.id} className="list-item static">
                <div className="grow">
                  <div className="title">{nameOf(data.members, c.user_id, me)} {c.amount_cents > 0 ? 'aportó' : 'sacó'}</div>
                  <div className="muted small">{formatDay(c.contributed_on)}{c.note ? ` · ${c.note}` : ''}</div>
                </div>
                <div className="amounts">
                  <div className={'title ' + (c.amount_cents < 0 ? 'negative' : '')}>{formatEuros(c.amount_cents)}</div>
                  <button className="link small" onClick={() => removeContribution(c.id)}>Borrar</button>
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
    </Sheet>
  );
}

function ContributionForm({ data, me, reload, goal, onClose }: ViewProps & { goal: SavingsGoal; onClose: () => void }) {
  const [who, setWho] = useState(me);
  const [direction, setDirection] = useState<'in' | 'out'>('in');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(today());
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(e: FormEvent) {
    e.preventDefault();
    const cents = parseEuros(amount);
    if (cents == null) return setError('Escribe un importe válido');
    setBusy(true);
    const { error } = await supabase.from('savings_contributions').insert({
      household_id: data.household.id,
      goal_id: goal.id,
      user_id: who,
      amount_cents: direction === 'in' ? cents : -cents,
      contributed_on: date,
      note: note.trim() || null,
    });
    setBusy(false);
    if (error) return setError(errorMessage(error));
    await reload();
    onClose();
  }

  return (
    <Sheet title={goal.name} onClose={onClose}>
      <form onSubmit={save} className="stack">
        <fieldset className="segmented">
          <legend>Movimiento</legend>
          {(['in', 'out'] as const).map((d) => (
            <label key={d} className={direction === d ? 'selected' : ''}>
              <input type="radio" name="direction" checked={direction === d} onChange={() => setDirection(d)} />
              {d === 'in' ? 'Aportar' : 'Sacar'}
            </label>
          ))}
        </fieldset>
        <fieldset className="segmented">
          <legend>¿Quién?</legend>
          {data.members.map((m) => (
            <label key={m.user_id} className={who === m.user_id ? 'selected' : ''}>
              <input type="radio" name="who" checked={who === m.user_id} onChange={() => setWho(m.user_id)} />
              {nameOf(data.members, m.user_id, me)}
            </label>
          ))}
        </fieldset>
        <label>
          Importe (€)
          <input className="amount-input" inputMode="decimal" required autoFocus placeholder="0,00" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </label>
        <label>
          Fecha
          <input type="date" required value={date} onChange={(e) => setDate(e.target.value)} />
        </label>
        <label>
          Nota (opcional)
          <input maxLength={200} value={note} onChange={(e) => setNote(e.target.value)} />
        </label>
        {error && <p className="error">{error}</p>}
        <button className="primary" disabled={busy}>Guardar</button>
      </form>
    </Sheet>
  );
}
