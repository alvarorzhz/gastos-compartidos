import { useId, useState, type FormEvent } from 'react';
import { formatShortDay, today } from '../lib/dates';
import { reportError } from '../lib/errorLog';
import { formatEuros, parseEuros } from '../lib/money';
import { nameOf, partnerOf } from '../lib/people';
import { goalProgress } from '../lib/savings';
import { errorMessage, supabase } from '../lib/supabase';
import type { Wish, WishKind } from '../lib/types';
import { chosenOne, moodText, rankWishes, VOTES, type RankedWish } from '../lib/wishes';
import { Avatar, celebrate, confirmAction, EmptyState, Progress, Segmented, Sheet, toast, type ViewProps, useSticky } from './common';
import { Icon } from './icons';
import { ExpenseForm } from './lazy';

/*
 * Presupuesto → Deseos: dos listas, caprichos y deseos. Cada uno vota cuánto le apetece y los
 * más votados por los dos suben arriba. El capricho más votado es «el elegido».
 */

const KIND_TEXT: Record<WishKind, { one: string; add: string; intro: string; empty: string; placeholder: string }> = {
  treat: {
    one: 'capricho',
    add: 'Añadir capricho',
    intro: 'Antojos para daros un gusto: una cena especial, un spa, ese juego… Votad los dos y el más votado es el elegido.',
    empty: 'Apuntad lo que os apetece y votadlo. El que más guste a los dos será el próximo.',
    placeholder: 'Ej.: Cena en el japonés',
  },
  wish: {
    one: 'deseo',
    add: 'Añadir deseo',
    intro: 'Cosas grandes para las que ahorrar: un sofá, un viaje, la bici… Votadlas y convertid la que más queráis en hucha.',
    empty: 'Apuntad lo que os gustaría tener algún día. Con un toque, cualquiera se convierte en hucha.',
    placeholder: 'Ej.: Sofá nuevo',
  },
};

export default function WishesView(props: ViewProps) {
  const { data } = props;
  const [kind, setKind] = useSticky<WishKind>('deseos.tipo', 'treat');
  const [editing, setEditing] = useState<Wish | 'new' | null>(null);
  const [treating, setTreating] = useState<Wish | null>(null);
  const [showDone, setShowDone] = useState(false);
  const memberIds = data.members.map((m) => m.user_id);
  const ranked = rankWishes(data.wishes, data.wishVotes, memberIds, kind);
  const chosen = kind === 'treat' ? chosenOne(ranked) : null;
  const rest = chosen ? ranked.slice(1) : ranked;
  const done = data.wishes.filter((w) => w.kind === kind && w.done_at).sort((a, b) => b.done_at!.localeCompare(a.done_at!));
  const text = KIND_TEXT[kind];

  async function markDone(w: Wish, value: boolean) {
    const { error } = await supabase.from('wishes').update({ done_at: value ? new Date().toISOString() : null }).eq('id', w.id);
    if (error) return toast('No se ha podido guardar: ' + errorMessage(error), 'error');
    await props.reload();
    if (value) celebrate(w.kind === 'treat' ? '¡A disfrutarlo!' : '¡Conseguido!');
  }

  return (
    <>
      <Segmented
        legend="Lista"
        hideLegend
        value={kind}
        options={[{ value: 'treat', label: 'Caprichos' }, { value: 'wish', label: 'Deseos' }]}
        onChange={setKind}
      />
      <p className="muted small wish-intro">{text.intro}</p>

      {chosen && <ChosenCard {...props} r={chosen} onTreat={() => setTreating(chosen.wish)} onDone={() => markDone(chosen.wish, true)} />}

      {ranked.length === 0 ? (
        <div className="card">
          <EmptyState
            icon={kind === 'treat' ? 'sparkles' : 'star'}
            title={kind === 'treat' ? 'Sin caprichos todavía' : 'Sin deseos todavía'}
            text={text.empty}
            action={<button className="primary" onClick={() => setEditing('new')}><Icon name="plus" /> {text.add}</button>}
          />
        </div>
      ) : (
        <section className="section" aria-label={kind === 'treat' ? 'Caprichos' : 'Deseos'}>
          {rest.length > 0 && (
            <ul className="list wish-list">
              {rest.map((r, i) => (
                <WishRow key={r.wish.id} {...props} r={r} rank={i + (chosen ? 2 : 1)} onOpen={() => setEditing(r.wish)} onDone={() => markDone(r.wish, true)} />
              ))}
            </ul>
          )}
          <button className="secondary" onClick={() => setEditing('new')}><Icon name="plus" size={18} /> {text.add}</button>
        </section>
      )}

      {done.length > 0 && (
        <section className="section">
          <button className="disclosure" aria-expanded={showDone} onClick={() => setShowDone(!showDone)}>
            <span className="summary">{kind === 'treat' ? 'Caprichos que os disteis' : 'Deseos conseguidos'} ({done.length})</span>
            <Icon name="chevronDown" />
          </button>
          {showDone && (
            <ul className="list">
              {done.map((w) => (
                <li key={w.id} className="row-item">
                  <span className="wish-done-icon" aria-hidden>{w.kind === 'treat' ? '🎉' : '⭐'}</span>
                  <span className="row-main">
                    <span className="row-title">{w.name}</span>
                    <span className="row-meta">{formatShortDay(w.done_at!.slice(0, 10), today())}{w.price_cents ? ` · ${formatEuros(w.price_cents)}` : ''}</span>
                  </span>
                  <button className="sm secondary" onClick={() => markDone(w, false)}>A la lista</button>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {editing && <WishSheet {...props} wish={editing === 'new' ? null : editing} kind={kind} onClose={() => setEditing(null)} />}
      {treating && (
        <ExpenseForm
          {...props}
          expense={null}
          prefill={{ amountCents: treating.price_cents, note: treating.name, date: today() }}
          prefillNotice="Apunta lo que os ha costado el capricho y se marcará como cumplido."
          onSaved={() => void markDone(treating, true)}
          onClose={() => setTreating(null)}
        />
      )}
    </>
  );
}

/** El capricho más votado por los dos, con el botón para dároslo. */
function ChosenCard({ data, me, r, onTreat, onDone }: ViewProps & { r: RankedWish; onTreat: () => void; onDone: () => void }) {
  return (
    <section className="card wish-chosen" aria-label="El capricho elegido">
      <span className="wish-chosen-kicker"><Icon name="sparkles" size={15} /> El elegido</span>
      <h2 className="wish-chosen-name">{r.wish.name}</h2>
      <p className="wish-chosen-meta">
        {moodText(r)}{r.wish.price_cents ? ` · ${formatEuros(r.wish.price_cents)}` : ''}
      </p>
      <VotesOf data={data} me={me} r={r} />
      <div className="row wish-chosen-actions">
        <button className="primary" onClick={onTreat}>¡Nos lo damos!</button>
        <button className="link-btn small" onClick={onDone}>Ya nos lo dimos</button>
      </div>
    </section>
  );
}

/** Cara y voto de cada uno ("Tú 🤩 · Bea 😍"). */
function VotesOf({ data, me, r }: Pick<ViewProps, 'data' | 'me'> & { r: RankedWish }) {
  return (
    <span className="wish-votes">
      {data.members.map((m) => {
        const score = r.byUser.get(m.user_id);
        const v = VOTES.find((x) => x.score === score);
        return (
          <span key={m.user_id} className="wish-vote" title={v?.label}>
            <Avatar members={data.members} userId={m.user_id} size="sm" />
            <span>{nameOf(data.members, m.user_id, me)}</span>
            <span aria-label={v ? v.label : 'sin votar'}>{v ? v.emoji : '…'}</span>
          </span>
        );
      })}
    </span>
  );
}

function WishRow(props: ViewProps & { r: RankedWish; rank: number; onOpen: () => void; onDone: () => void }) {
  const { data, me, reload, r, rank, onOpen, onDone } = props;
  const [busy, setBusy] = useState(false);
  const w = r.wish;
  const mine = r.byUser.get(me);
  const partner = partnerOf(data.members, me);
  const goal = w.goal_id ? data.goals.find((g) => g.id === w.goal_id) : undefined;
  const progress = goal ? goalProgress(goal, data.contributions) : null;
  const vetoers = [...r.byUser].filter(([, s]) => s === 0).map(([id]) => id);
  const status = r.vetoed
    ? vetoers.length > 1 ? 'Pasáis los dos' : vetoers[0] === me ? 'Has pasado' : `${nameOf(data.members, vetoers[0], me)} pasa`
    : mine == null
      ? 'Falta tu voto'
      : r.missing.length > 0 && partner
        ? `Falta el voto de ${partner.display_name}`
        : moodText(r);

  async function vote(score: number) {
    if (score === mine) return;
    setBusy(true);
    const { error } = await supabase
      .from('wish_votes')
      .upsert({ wish_id: w.id, household_id: data.household.id, user_id: me, score, updated_at: new Date().toISOString() }, { onConflict: 'wish_id,user_id' });
    setBusy(false);
    if (error) return toast('No se ha podido votar: ' + errorMessage(error), 'error');
    await reload();
  }

  async function makeGoal() {
    if (!w.price_cents) return onOpen();
    setBusy(true);
    const { data: goalRow, error } = await supabase
      .from('savings_goals')
      .insert({ name: w.name.slice(0, 60), target_cents: w.price_cents, household_id: data.household.id })
      .select('id')
      .single();
    if (!error && goalRow) {
      const linked = await supabase.from('wishes').update({ goal_id: goalRow.id }).eq('id', w.id);
      if (linked.error) reportError(linked.error, 'unir deseo y hucha');
    }
    setBusy(false);
    if (error) return toast('No se ha podido crear la hucha: ' + errorMessage(error), 'error');
    await reload();
    toast('Hucha creada: la tenéis en Presupuesto');
  }

  return (
    <li className={'wish-row' + (r.vetoed ? ' wish-vetoed' : '')}>
      <button className="wish-main" onClick={onOpen}>
        <span className={'wish-rank' + (rank <= 3 && !r.vetoed && r.missing.length === 0 ? ' wish-rank-top' : '')}>{rank}</span>
        <span className="row-main">
          <span className="row-title">{w.name}</span>
          <span className={'row-meta' + (mine == null ? ' wish-needs-vote' : '')}>
            {status}{w.price_cents ? ` · ${formatEuros(w.price_cents)}` : ''}
          </span>
        </span>
        {r.byUser.size > 0 && <span className="wish-score" aria-label={`${r.total} puntos`}>{r.total}<small>/{data.members.length * 3}</small></span>}
      </button>

      <div className="wish-voting">
        <div className="wish-choices" role="group" aria-label={`¿Cuánto te apetece ${w.name}?`}>
          {VOTES.map((v) => (
            <button key={v.score} className={'wish-choice' + (mine === v.score ? ' selected' : '')} aria-pressed={mine === v.score} disabled={busy} onClick={() => vote(v.score)} title={v.label} aria-label={v.label}>
              <span aria-hidden>{v.emoji}</span>
              <span className="wish-choice-label">{v.short}</span>
            </button>
          ))}
        </div>
        {partner && r.byUser.has(partner.user_id) && (
          <span className="wish-partner-vote" title={`Voto de ${partner.display_name}`}>
            <Avatar members={data.members} userId={partner.user_id} size="sm" />
            {VOTES.find((v) => v.score === r.byUser.get(partner.user_id))?.emoji}
          </span>
        )}
      </div>

      {w.kind === 'wish' && (
        <div className="wish-goal">
          {goal && progress ? (
            <>
              <Progress value={progress.savedCents} max={goal.target_cents} label={`Hucha ${goal.name}`} tone="saving" />
              <span className="small muted">Hucha: {formatEuros(progress.savedCents)} de {formatEuros(goal.target_cents)}</span>
              {progress.savedCents >= goal.target_cents && <button className="sm tinted" onClick={onDone}>¡Conseguido!</button>}
            </>
          ) : (
            <button className="sm tinted" onClick={makeGoal} disabled={busy}>
              <Icon name="piggy" size={16} /> {w.price_cents ? 'Empezar a ahorrar' : 'Ponle precio para ahorrar'}
            </button>
          )}
        </div>
      )}
    </li>
  );
}

/** Añadir o editar un deseo o capricho (al añadirlo, quien lo apunta ya vota). */
function WishSheet({ data, me, reload, wish, kind, onClose }: ViewProps & { wish: Wish | null; kind: WishKind; onClose: () => void }) {
  const formId = useId();
  const [type, setType] = useState<WishKind>(wish?.kind ?? kind);
  const [name, setName] = useState(wish?.name ?? '');
  const [price, setPrice] = useState(wish?.price_cents ? String(wish.price_cents / 100).replace('.', ',') : '');
  const [note, setNote] = useState(wish?.note ?? '');
  const [score, setScore] = useState(2);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const text = KIND_TEXT[type];

  async function save(e: FormEvent) {
    e.preventDefault();
    const cents = price.trim() ? parseEuros(price) : null;
    if (!name.trim()) return setError(`Ponle un nombre al ${text.one}`);
    if (price.trim() && cents == null) return setError('El precio no se entiende: escribe por ejemplo 60 o 59,90');
    const fields = { kind: type, name: name.trim(), price_cents: cents, note: note.trim() || null };
    setBusy(true);
    if (wish) {
      const { error: err } = await supabase.from('wishes').update(fields).eq('id', wish.id);
      setBusy(false);
      if (err) return setError(errorMessage(err));
    } else {
      const { data: row, error: err } = await supabase.from('wishes').insert({ ...fields, household_id: data.household.id }).select('id').single();
      if (err || !row) {
        setBusy(false);
        return setError(errorMessage(err));
      }
      const voted = await supabase.from('wish_votes').insert({ wish_id: row.id, household_id: data.household.id, user_id: me, score });
      if (voted.error) reportError(voted.error, 'votar al añadir deseo');
      setBusy(false);
    }
    await reload();
    toast(wish ? 'Guardado' : type === 'treat' ? 'Capricho apuntado' : 'Deseo apuntado');
    onClose();
  }

  async function remove() {
    if (!wish) return;
    const ok = await confirmAction({ title: `¿Borrar «${wish.name}»?`, message: 'Se borran también los votos.', confirmLabel: 'Borrar', danger: true });
    if (!ok) return;
    setBusy(true);
    const { error: err } = await supabase.from('wishes').delete().eq('id', wish.id);
    setBusy(false);
    if (err) return setError(errorMessage(err));
    await reload();
    toast('Borrado');
    onClose();
  }

  return (
    <Sheet
      title={wish ? `Editar ${KIND_TEXT[wish.kind].one}` : text.add}
      subtitle={wish ? `Lo apuntó ${nameOf(data.members, wish.created_by, me)}` : undefined}
      onClose={onClose}
      footer={
        <>
          {error && <p className="error" role="alert">{error}</p>}
          <div className="row">
            {wish && <button type="button" className="danger" onClick={remove} disabled={busy}>Borrar</button>}
            <button type="submit" form={formId} className="primary lg" disabled={busy}>{busy ? 'Guardando…' : 'Guardar'}</button>
          </div>
        </>
      }
    >
      <form id={formId} onSubmit={save} className="stack" noValidate>
        <Segmented legend="Tipo" value={type} options={[{ value: 'treat', label: 'Capricho' }, { value: 'wish', label: 'Deseo' }]} onChange={setType} />
        <div className="field">
          <label className="field-label" htmlFor={formId + '-name'}>¿Qué os apetece?</label>
          <input id={formId + '-name'} maxLength={80} autoFocus={!wish} value={name} onChange={(e) => setName(e.target.value)} placeholder={text.placeholder} />
        </div>
        <div className="field">
          <label className="field-label" htmlFor={formId + '-price'}>Precio aproximado (€, opcional)</label>
          <input id={formId + '-price'} inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="60" />
        </div>
        <div className="field">
          <label className="field-label" htmlFor={formId + '-note'}>Nota (opcional)</label>
          <input id={formId + '-note'} maxLength={200} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Dónde, cuándo, un enlace…" />
        </div>
        {!wish && (
          <fieldset className="field">
            <legend className="field-label">¿Cuánto te apetece a ti?</legend>
            <div className="wish-choices">
              {VOTES.filter((v) => v.score > 0).map((v) => (
                <button type="button" key={v.score} className={'wish-choice' + (score === v.score ? ' selected' : '')} aria-pressed={score === v.score} onClick={() => setScore(v.score)}>
                  <span aria-hidden>{v.emoji}</span>
                  <span className="wish-choice-label">{v.short}</span>
                </button>
              ))}
            </div>
          </fieldset>
        )}
      </form>
    </Sheet>
  );
}
