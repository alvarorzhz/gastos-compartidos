import { useId, useState, type FormEvent } from 'react';
import { formatDayHeading, today } from '../lib/dates';
import { centsToInput, formatEuros, parseEuros } from '../lib/money';
import { nameOf } from '../lib/people';
import { goalProgress } from '../lib/savings';
import { errorMessage, supabase } from '../lib/supabase';
import type { SavingsGoal } from '../lib/types';
import { AmountField, Avatar, confirmAction, EmptyState, Progress, SectionHeader, Segmented, Sheet, toast, type ViewProps  } from './common';
import { Icon } from './icons';

/** Huchas comunes: objetivos de ahorro con lo que aporta cada uno. No cuentan en el saldo. */
export default function Savings(props: ViewProps) {
  const { data, me } = props;
  const [editing, setEditing] = useState<SavingsGoal | 'new' | null>(null);
  const [contributing, setContributing] = useState<SavingsGoal | null>(null);
  const goals = data.goals.filter((g) => !g.archived);

  return (
    <section className="section" aria-labelledby="savings-title">
      <SectionHeader
        id="savings-title"
        title="Huchas"
        action={goals.length > 0 && <button className="link-btn small" onClick={() => setEditing('new')}><Icon name="plus" size={16} /> Nueva hucha</button>}
      />
      {goals.length === 0 ? (
        <div className="card">
          <EmptyState
            icon="piggy"
            title="Ahorrad para algo juntos"
            text="Cread una hucha para un viaje, un sofá o lo que queráis. Lo que metáis no cuenta en el saldo entre vosotros."
            action={<button className="tinted" onClick={() => setEditing('new')}><Icon name="plus" size={18} /> Crear una hucha</button>}
          />
        </div>
      ) : (
        goals.map((g) => {
          const p = goalProgress(g, data.contributions);
          const done = p.savedCents >= g.target_cents;
          return (
            <article key={g.id} className="card goal-card" aria-label={`Hucha ${g.name}`}>
              <div className="goal-head">
                <span className={'icon-tile ' + (done ? 'positive' : 'accent')}><Icon name={done ? 'check' : 'piggy'} /></span>
                <div className="grow">
                  <h3 className="ellipsis">{g.name}</h3>
                  <p className="muted small">{done ? '¡Objetivo conseguido!' : `Faltan ${formatEuros(g.target_cents - p.savedCents)}`}</p>
                </div>
                <button className="icon-btn" onClick={() => setEditing(g)} aria-label={`Editar la hucha ${g.name}`}><Icon name="edit" size={18} /></button>
              </div>
              <div className="goal-amounts">
                <span className="stat-mid">{formatEuros(p.savedCents)}</span>
                <span className="muted small">de {formatEuros(g.target_cents)} · {Math.max(0, Math.round(p.ratio * 100))} %</span>
              </div>
              <Progress value={p.savedCents} max={g.target_cents} label={`Ahorrado en ${g.name}`} tone="saving" />
              {p.byUser.size > 0 && (
                <div className="goal-people">
                  {[...p.byUser.entries()].map(([u, c]) => (
                    <span key={u}><Avatar members={data.members} userId={u} size="sm" />{nameOf(data.members, u, me)}: <strong>{formatEuros(c)}</strong></span>
                  ))}
                </div>
              )}
              <button className="tinted" onClick={() => setContributing(g)}>Aportar o sacar</button>
            </article>
          );
        })
      )}

      {editing && <GoalForm {...props} goal={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
      {contributing && <ContributionForm {...props} goal={contributing} onClose={() => setContributing(null)} />}
    </section>
  );
}

function GoalForm({ data, me, reload, goal, onClose }: ViewProps & { goal: SavingsGoal | null; onClose: () => void }) {
  const formId = useId();
  const [name, setName] = useState(goal?.name ?? '');
  const [target, setTarget] = useState(goal ? centsToInput(goal.target_cents) : '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const contributions = goal ? data.contributions.filter((c) => c.goal_id === goal.id) : [];

  async function run(p: PromiseLike<{ error: unknown }>, done?: string) {
    setBusy(true);
    const { error } = await p;
    setBusy(false);
    if (error) {
      setError(errorMessage(error));
      return false;
    }
    await reload();
    if (done) toast(done);
    return true;
  }

  async function save(e: FormEvent) {
    e.preventDefault();
    const cents = parseEuros(target);
    if (!name.trim()) return setError('Ponle un nombre a la hucha');
    if (cents == null) return setError('Escribe el objetivo, por ejemplo 1500');
    const fields = { name: name.trim(), target_cents: cents };
    const ok = await run(
      goal
        ? supabase.from('savings_goals').update(fields).eq('id', goal.id)
        : supabase.from('savings_goals').insert({ ...fields, household_id: data.household.id }),
      goal ? 'Hucha guardada' : 'Hucha creada',
    );
    if (ok) onClose();
  }

  async function remove() {
    if (!goal) return;
    const ok = await confirmAction({ title: `¿Borrar la hucha "${goal.name}"?`, message: 'También se borran sus aportaciones.', confirmLabel: 'Borrar', danger: true });
    if (ok && (await run(supabase.from('savings_goals').delete().eq('id', goal.id), 'Hucha borrada'))) onClose();
  }

  async function archive() {
    if (goal && (await run(supabase.from('savings_goals').update({ archived: true }).eq('id', goal.id), 'Hucha archivada'))) onClose();
  }

  async function removeContribution(id: string) {
    if (await confirmAction({ title: '¿Borrar esta aportación?', confirmLabel: 'Borrar', danger: true })) {
      await run(supabase.from('savings_contributions').delete().eq('id', id), 'Aportación borrada');
    }
  }

  return (
    <Sheet
      title={goal ? 'Editar hucha' : 'Nueva hucha'}
      onClose={onClose}
      footer={
        <>
          {error && <p className="error" role="alert">{error}</p>}
          <div className="row">
            {goal && <button type="button" className="danger" onClick={remove} disabled={busy}>Borrar</button>}
            {goal && <button type="button" className="secondary" onClick={archive} disabled={busy}>Archivar</button>}
            <button type="submit" form={formId} className="primary lg" disabled={busy}>{busy ? 'Guardando…' : 'Guardar'}</button>
          </div>
        </>
      }
    >
      <form id={formId} onSubmit={save} className="stack" noValidate>
        <div className="field">
          <label className="field-label" htmlFor={formId + '-name'}>Nombre</label>
          <input id={formId + '-name'} maxLength={60} autoFocus={!goal} value={name} onChange={(e) => setName(e.target.value)} placeholder="Ej.: Viaje a Italia" />
        </div>
        <div className="field">
          <label className="field-label" htmlFor={formId + '-target'}>Objetivo (€)</label>
          <input id={formId + '-target'} inputMode="decimal" value={target} onChange={(e) => setTarget(e.target.value)} placeholder="1500" />
        </div>
        {goal && <p className="field-hint">Archivar la oculta de Presupuesto sin borrar lo ahorrado.</p>}
      </form>
      {contributions.length > 0 && (
        <div className="section" style={{ marginTop: 'var(--s5)' }}>
          <SectionHeader title="Movimientos" />
          <ul className="list with-icons">
            {contributions.map((c) => (
              <li key={c.id} className="row-item">
                <Avatar members={data.members} userId={c.user_id} />
                <span className="row-main">
                  <span className="row-title">{nameOf(data.members, c.user_id, me)} {c.amount_cents > 0 ? 'aportó' : 'sacó'}</span>
                  <span className="row-meta">{formatDayHeading(c.contributed_on)}{c.note ? ` · ${c.note}` : ''}</span>
                </span>
                <span className={'row-amount ' + (c.amount_cents < 0 ? 'negative' : 'positive')}>{formatEuros(c.amount_cents)}</span>
                <button className="icon-btn danger-icon" onClick={() => removeContribution(c.id)} aria-label="Borrar aportación"><Icon name="trash" size={18} /></button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Sheet>
  );
}

function ContributionForm({ data, me, reload, goal, onClose }: ViewProps & { goal: SavingsGoal; onClose: () => void }) {
  const formId = useId();
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
    if (cents == null) return setError('Escribe un importe válido, por ejemplo 50');
    if (!date) return setError('Elige una fecha');
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
    toast(direction === 'in' ? 'Aportación guardada' : 'Retirada guardada');
    onClose();
  }

  return (
    <Sheet
      title={goal.name}
      subtitle="Apunta lo que metéis o sacáis de la hucha."
      onClose={onClose}
      footer={
        <>
          {error && <p className="error" role="alert">{error}</p>}
          <button type="submit" form={formId} className="primary lg block" disabled={busy}>{busy ? 'Guardando…' : 'Guardar'}</button>
        </>
      }
    >
      <form id={formId} onSubmit={save} className="stack" noValidate>
        <Segmented legend="Movimiento" hideLegend value={direction} options={[{ value: 'in', label: 'Aportar' }, { value: 'out', label: 'Sacar' }]} onChange={setDirection} />
        <AmountField label="Importe" value={amount} onChange={setAmount} autoFocus />
        {data.members.length > 1 && (
          <Segmented
            legend="¿Quién?"
            value={who}
            options={data.members.map((m) => ({ value: m.user_id, label: <><Avatar members={data.members} userId={m.user_id} size="sm" />{nameOf(data.members, m.user_id, me)}</> }))}
            onChange={setWho}
          />
        )}
        <div className="field">
          <label className="field-label" htmlFor={formId + '-date'}>Fecha</label>
          <input id={formId + '-date'} type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <div className="field">
          <label className="field-label" htmlFor={formId + '-note'}>Nota <span className="faint">(opcional)</span></label>
          <input id={formId + '-note'} maxLength={200} value={note} onChange={(e) => setNote(e.target.value)} />
        </div>
      </form>
    </Sheet>
  );
}
