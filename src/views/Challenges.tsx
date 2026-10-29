import { useEffect, useId, useMemo, useState, type FormEvent } from 'react';
import { challengeProgress, monthPeriod, progressText, suggestChallenges, type ChallengeProgress, type NewChallenge } from '../lib/challenges';
import { addDays, today } from '../lib/dates';
import { reportError } from '../lib/errorLog';
import { formatEuros, parseEuros } from '../lib/money';
import { nameOf, partnerOf } from '../lib/people';
import { errorMessage, supabase } from '../lib/supabase';
import type { Challenge, ChallengeKind } from '../lib/types';
import { AmountField, celebrate, Progress, Segmented, Sheet, toast, type ViewProps } from './common';
import { Icon } from './icons';

/*
 * Retos de pareja en Inicio: la propuesta que espera respuesta, los retos en marcha con su
 * progreso y, al terminar, si lo habéis conseguido. Desde aquí se propone uno nuevo.
 */

const SEEN_KEY = 'gastos.retosVistos';
const celebrated = new Set<string>();

function seenResults(): Set<string> {
  try {
    const raw = JSON.parse(localStorage.getItem(SEEN_KEY) ?? '[]');
    return new Set(Array.isArray(raw) ? raw.filter((x): x is string => typeof x === 'string') : []);
  } catch {
    return new Set();
  }
}

function markSeen(id: string) {
  try {
    localStorage.setItem(SEEN_KEY, JSON.stringify([...seenResults(), id].slice(-100)));
  } catch {
    // Sin almacenamiento: el resultado volverá a salir, sin más.
  }
}

/** Avisa al otro de la propuesta o de que se ha aceptado (si tiene los avisos puestos). */
function notify(challengeId: string) {
  void supabase.functions.invoke('avisar', { body: { challenge_id: challengeId } }).catch(() => undefined);
}

interface Item {
  c: Challenge;
  p: ChallengeProgress;
}

export default function Challenges(props: ViewProps) {
  const { data, me } = props;
  const [seen, setSeen] = useState(seenResults);
  const [proposing, setProposing] = useState(false);
  const todayIso = today();
  const items = useMemo(
    () => data.challenges.map((c) => ({ c, p: challengeProgress(c, todayIso, data.expenses, data.contributions) })),
    [data.challenges, data.expenses, data.contributions, todayIso],
  );
  const partner = partnerOf(data.members, me);
  // Una propuesta que nadie aceptó antes de que acabara su plazo ya no se enseña.
  const live = items.filter((x) => (x.p.state === 'pending' && x.c.ends_on >= todayIso) || x.p.state === 'active' || x.p.state === 'upcoming');
  // Resultados de los últimos días que aún no habéis visto en este móvil.
  const results = items.filter((x) => (x.p.state === 'won' || x.p.state === 'lost') && !seen.has(x.c.id) && x.c.ends_on >= addDays(todayIso, -7));

  const wonIds = results.filter((x) => x.p.state === 'won').map((x) => x.c.id).join();
  useEffect(() => {
    // Una sola fiesta por reto y sesión, aunque se vuelva a Inicio.
    const fresh = wonIds.split(',').filter((id) => id && !celebrated.has(id));
    if (fresh.length === 0) return;
    fresh.forEach((id) => celebrated.add(id));
    celebrate('¡Reto conseguido!');
  }, [wonIds]);

  if (!partner && data.challenges.length === 0) return null;

  function dismiss(id: string) {
    markSeen(id);
    setSeen(seenResults());
  }

  return (
    <section className="card stack-sm challenges o-3" aria-labelledby="challenges-title">
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <h2 id="challenges-title" className="row stat-label"><Icon name="target" size={16} /> Retos de pareja</h2>
        {(live.length > 0 || results.length > 0) && (
          <button className="link-btn small" onClick={() => setProposing(true)}>Proponer otro</button>
        )}
      </div>

      {results.map((x) => <Result key={x.c.id} {...x} todayIso={todayIso} onDone={() => dismiss(x.c.id)} />)}
      {live.map((x) => <Live key={x.c.id} {...props} {...x} todayIso={todayIso} />)}

      {live.length === 0 && results.length === 0 && (
        <>
          <p className="muted small">Proponed un reto pequeño (un tope en el súper, una semana sin pedir a domicilio…) y la app irá contando cómo vais.</p>
          <button className="secondary" onClick={() => setProposing(true)}><Icon name="target" size={18} /> Proponer un reto</button>
        </>
      )}

      {proposing && <ProposeSheet {...props} onClose={() => setProposing(false)} />}
    </section>
  );
}

function Result({ c, p, todayIso, onDone }: Item & { todayIso: string; onDone: () => void }) {
  const won = p.state === 'won';
  return (
    <div className={'challenge challenge-' + p.state}>
      <p className="challenge-title">{won ? '🏆 ' : ''}{c.title}</p>
      <p className="small">{progressText(c, p, todayIso)}</p>
      <div className="row" style={{ justifyContent: 'flex-end' }}>
        <button className="sm secondary" onClick={onDone}>{won ? '¡Bien!' : 'Vale'}</button>
      </div>
    </div>
  );
}

function Live({ data, me, reload, c, p, todayIso }: ViewProps & Item & { todayIso: string }) {
  const [busy, setBusy] = useState(false);
  const mine = c.proposed_by === me;
  const proposer = nameOf(data.members, c.proposed_by, me);
  const other = partnerOf(data.members, me)?.display_name ?? 'tu pareja';

  async function accept() {
    setBusy(true);
    const { error } = await supabase.from('challenges').update({ accepted_at: new Date().toISOString() }).eq('id', c.id);
    setBusy(false);
    if (error) return toast('No se ha podido aceptar: ' + errorMessage(error), 'error');
    notify(c.id);
    await reload();
    toast('¡Reto aceptado! A por ello 💪');
  }

  async function drop() {
    setBusy(true);
    const { error } = await supabase.from('challenges').delete().eq('id', c.id);
    setBusy(false);
    if (error) return toast('No se ha podido quitar: ' + errorMessage(error), 'error');
    await reload();
  }

  if (p.state === 'pending') {
    return (
      <div className="challenge challenge-pending">
        <p className="small muted">{mine ? `Esperando a que ${other} lo acepte` : `${proposer} te propone un reto`}</p>
        <p className="challenge-title">{c.title}</p>
        <div className="row" style={{ justifyContent: 'flex-end' }}>
          <button className="sm secondary" onClick={() => void drop()} disabled={busy}>{mine ? 'Retirarlo' : 'No, gracias'}</button>
          {!mine && <button className="sm primary" onClick={() => void accept()} disabled={busy}>Aceptar</button>}
        </div>
      </div>
    );
  }

  const label = c.kind === 'cap' ? 'Límite del reto usado' : c.kind === 'save' ? 'Ahorrado para el reto' : 'Días del reto';
  return (
    <div className={'challenge challenge-' + p.state}>
      <p className="challenge-title">{c.title}</p>
      {p.state === 'active' && <Progress value={p.ratio} max={1} label={label} tone={c.kind === 'cap' ? undefined : 'saving'} />}
      <p className="small muted">{progressText(c, p, todayIso)}</p>
    </div>
  );
}

const DAYS = [
  { value: '7', label: '1 semana', title: 'Una semana' },
  { value: '14', label: '2 semanas', title: 'Dos semanas' },
  { value: '30', label: '1 mes', title: 'Un mes' },
] as const;

function ProposeSheet({ data, me, reload, onClose }: ViewProps & { onClose: () => void }) {
  const formId = useId();
  const todayIso = today();
  const period = monthPeriod(todayIso);
  const categories = data.categories.filter((c) => !c.archived);
  const goals = data.goals.filter((g) => !g.archived);
  const [kind, setKind] = useState<ChallengeKind>('cap');
  const [categoryId, setCategoryId] = useState(categories[0]?.id ?? '');
  const [keyword, setKeyword] = useState('');
  const [goalId, setGoalId] = useState(goals[0]?.id ?? '');
  const [amount, setAmount] = useState('');
  const [days, setDays] = useState<(typeof DAYS)[number]['value']>('7');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const live = data.challenges.filter((c) => c.ends_on >= todayIso).map((c) => c.title);
  const suggestions = suggestChallenges(todayIso, data).filter((s) => !live.includes(s.title));
  const alone = data.members.length < 2;
  const past = data.challenges.filter((c) => c.accepted_at && c.ends_on < todayIso);
  const won = past.filter((c) => challengeProgress(c, todayIso, data.expenses, data.contributions).state === 'won').length;

  async function propose(row: NewChallenge) {
    setBusy(true);
    setError(null);
    const { data: created, error } = await supabase
      .from('challenges')
      .insert({ ...row, household_id: data.household.id, proposed_by: me })
      .select('id')
      .single();
    if (error || !created) {
      setBusy(false);
      return setError(errorMessage(error));
    }
    // Sin pareja todavía, el reto es solo tuyo: queda aceptado.
    if (alone) {
      const { error: acceptError } = await supabase.from('challenges').update({ accepted_at: new Date().toISOString() }).eq('id', created.id);
      if (acceptError) reportError(acceptError, 'aceptar reto');
    } else {
      notify(created.id as string);
    }
    await reload();
    setBusy(false);
    toast(alone ? 'Reto en marcha' : 'Reto propuesto: falta que lo acepte tu pareja');
    onClose();
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    const cents = parseEuros(amount);
    const category = categories.find((c) => c.id === categoryId);
    const base = { category_id: null, keyword: null, goal_id: null, amount_cents: null, starts_on: period.starts_on, ends_on: period.ends_on };
    if (kind === 'cap') {
      if (!category) return setError('Elige una categoría.');
      if (cents == null) return setError('Escribe el tope, por ejemplo 300.');
      return void propose({ ...base, kind, title: `${period.label}, ${category.name} por debajo de ${formatEuros(cents)}`, category_id: category.id, amount_cents: cents });
    }
    if (kind === 'save') {
      const goal = goals.find((g) => g.id === goalId);
      if (!goal) return setError('Elige una hucha.');
      if (cents == null) return setError('Escribe cuánto queréis meter, por ejemplo 100.');
      return void propose({ ...base, kind, title: `${period.label}, meter ${formatEuros(cents)} en «${goal.name}»`, goal_id: goal.id, amount_cents: cents });
    }
    const word = keyword.trim();
    if (!category && !word) return setError('Elige una categoría o escribe qué evitar.');
    const span = DAYS.find((d) => d.value === days)!;
    const what = word && !category ? word : word ? `${category!.name} ni ${word}` : category!.name;
    void propose({
      ...base, kind, title: `${span.title} sin ${what}`, category_id: category?.id ?? null, keyword: word || null,
      starts_on: todayIso, ends_on: addDays(todayIso, Number(days) - 1),
    });
  }

  return (
    <Sheet
      title="Proponer un reto"
      subtitle={past.length > 0 ? `Lleváis ${won} de ${past.length} retos conseguidos.` : 'La app irá contando cómo vais con lo que apuntéis.'}
      onClose={onClose}
      footer={
        <>
          {error && <p className="error" role="alert">{error}</p>}
          <button type="submit" form={formId} className="primary lg" disabled={busy}>{busy ? 'Guardando…' : 'Proponer este reto'}</button>
        </>
      }
    >
      <div className="stack">
        {suggestions.length > 0 && (
          <section className="stack-sm" aria-labelledby={formId + '-ideas'}>
            <h3 id={formId + '-ideas'} className="stat-label">Ideas para vosotros</h3>
            <ul className="list">
              {suggestions.map((s) => (
                <li key={s.title}>
                  <div className="row-item">
                    <span className="row-main"><span className="row-title challenge-idea">{s.title}</span></span>
                    <button className="sm tinted" onClick={() => void propose(s)} disabled={busy}>Proponer</button>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        )}

        <form id={formId} onSubmit={submit} className="stack" noValidate>
          <h3 className="stat-label">{suggestions.length > 0 ? 'O uno a vuestra manera' : 'Vuestro reto'}</h3>
          <Segmented<ChallengeKind>
            legend="Tipo de reto"
            value={kind}
            options={[{ value: 'cap', label: 'Tope' }, { value: 'without', label: 'Días sin' }, { value: 'save', label: 'Ahorrar' }]}
            onChange={(k) => { setKind(k); setError(null); }}
          />
          {kind !== 'save' && (
            <div className="field">
              <label className="field-label" htmlFor={formId + '-cat'}>Categoría</label>
              <select id={formId + '-cat'} value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
                {kind === 'without' && <option value="">Ninguna (solo lo de abajo)</option>}
                {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
          )}
          {kind === 'without' && (
            <>
              <div className="field">
                <label className="field-label" htmlFor={formId + '-word'}>O lo que lleve en el concepto (opcional)</label>
                <input id={formId + '-word'} value={keyword} maxLength={40} placeholder="Por ejemplo, Glovo" onChange={(e) => setKeyword(e.target.value)} />
              </div>
              <Segmented legend="Durante" value={days} options={DAYS.map((d) => ({ value: d.value, label: d.label }))} onChange={setDays} />
            </>
          )}
          {kind === 'save' && (
            goals.length === 0 ? (
              <p className="muted small">Para un reto de ahorro hace falta una hucha. Creadla en Presupuesto → Huchas.</p>
            ) : (
              <div className="field">
                <label className="field-label" htmlFor={formId + '-goal'}>Hucha</label>
                <select id={formId + '-goal'} value={goalId} onChange={(e) => setGoalId(e.target.value)}>
                  {goals.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
                </select>
              </div>
            )
          )}
          {kind !== 'without' && <AmountField label={kind === 'cap' ? 'Tope' : 'Cuánto meter'} value={amount} onChange={setAmount} />}
          <p className="field-hint">
            {kind === 'without'
              ? 'Empieza hoy. Si se apunta algo de eso antes de acabar, el reto se pierde.'
              : `${period.label} (hasta el ${Number(period.ends_on.slice(8))}).`}
            {!alone && ' Tu pareja tiene que aceptarlo para que empiece a contar.'}
          </p>
        </form>
      </div>
    </Sheet>
  );
}
