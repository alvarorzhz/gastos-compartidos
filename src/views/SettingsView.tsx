import { useEffect, useId, useState, type FormEvent } from 'react';
import { AVATAR_EMOJIS, PERSON_COLORS, personColor } from '../lib/couple';
import { exportJson, exportXlsx } from '../lib/exportData';
import { partnerOf } from '../lib/people';
import { defaultMyPercent } from '../lib/split';
import { errorMessage, supabase } from '../lib/supabase';
import { signOut } from '../lib/session';
import { askText, Avatar, CategoryIcon, confirmAction, Notice, toast, type ViewProps } from './common';
import { Icon } from './icons';
import InstallCard from './InstallCard';
import PasswordSettings from './PasswordSettings';
import PushSettings from './PushSettings';
import AutomationStatus from './AutomationStatus';
import ApplePaySettings from './ApplePaySettings';
import { VersionCard } from './WhatsNew';

export default function SettingsView(props: ViewProps & { email: string }) {
  const { data, me, reload, email } = props;
  const partner = partnerOf(data.members, me);
  const myMember = data.members.find((m) => m.user_id === me)!;

  return (
    <>
      <section className="settings-group" aria-labelledby="set-space">
        <h2 id="set-space">Vuestro espacio</h2>
        <ul className="list">
          <li>
            <InlineText
              label="Nombre del espacio"
              value={data.household.name}
              maxLength={60}
              onSave={(name) => supabase.from('households').update({ name }).eq('id', data.household.id)}
              reload={reload}
            />
          </li>
          <li>
            <InlineText
              label="Tu nombre"
              value={myMember.display_name}
              maxLength={40}
              onSave={(display_name) => supabase.from('members').update({ display_name }).eq('user_id', me)}
              reload={reload}
            />
          </li>
        </ul>
        <p className="note">Has entrado como {email}.</p>
      </section>

      <Profile {...props} />

      <section className="settings-group" aria-labelledby="set-partner">
        <h2 id="set-partner">Tu pareja</h2>
        {partner ? (
          <ul className="list">
            <li className="row-item">
              <span className="avatar-pair">
                <Avatar members={data.members} userId={me} />
                <Avatar members={data.members} userId={partner.user_id} />
              </span>
              <span className="row-main">
                <span className="row-title">{partner.display_name} ya está en el espacio</span>
                <span className="row-meta">Solo vosotros dos podéis ver estos datos.</span>
              </span>
            </li>
          </ul>
        ) : (
          <div className="card"><InviteForm {...props} /></div>
        )}
      </section>

      {partner && <DefaultSplit {...props} partnerName={partner.display_name} />}

      <Categories {...props} />

      <PasswordSettings email={email} />

      <InstallCard />

      <PushSettings hasPartner={partner != null} />

      <ApplePaySettings />

      <AutomationStatus />

      <section className="settings-group" aria-labelledby="set-data">
        <h2 id="set-data">Tus datos</h2>
        <ul className="list with-icons">
          <li>
            <button className="row-item" onClick={() => exportXlsx(data)}>
              <span className="icon-tile accent"><Icon name="download" /></span>
              <span className="row-main"><span className="row-title">Exportar a Excel</span><span className="row-meta">Una hoja para cada cosa</span></span>
            </button>
          </li>
          <li>
            <button className="row-item" onClick={() => exportJson(data)}>
              <span className="icon-tile accent"><Icon name="download" /></span>
              <span className="row-main"><span className="row-title">Exportar JSON</span><span className="row-meta">Copia completa de los datos</span></span>
            </button>
          </li>
        </ul>
        <p className="note">El Excel trae una hoja para gastos, reembolsos, presupuestos, huchas, sus movimientos y tus movimientos personales. El JSON es una copia completa de todo.</p>
      </section>

      <VersionCard />

      <section className="settings-group" aria-label="Sesión">
        <ul className="list with-icons">
          <li>
            <button className="row-item" onClick={() => void signOut()}>
              <span className="icon-tile"><Icon name="logout" /></span>
              <span className="row-main"><span className="row-title">Cerrar sesión</span></span>
            </button>
          </li>
        </ul>
      </section>

      <DangerZone {...props} />
    </>
  );
}

function InlineText({ label, value, maxLength, onSave, reload }: {
  label: string;
  value: string;
  maxLength: number;
  onSave: (v: string) => PromiseLike<{ error: unknown }>;
  reload: () => Promise<void>;
}) {
  const id = useId();
  const [text, setText] = useState(value);
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Si la otra persona lo cambia mientras no lo estás editando, se muestra lo nuevo
  // (antes se quedaba el texto viejo y al salir del campo se volvía a guardar).
  useEffect(() => {
    if (!editing) setText(value);
  }, [value, editing]);
  async function commit() {
    setEditing(false);
    const v = text.trim();
    if (!v || v === value) return setText(value);
    const { error } = await onSave(v);
    if (error) setError(errorMessage(error));
    else {
      setError(null);
      toast('Guardado');
      await reload();
    }
  }
  return (
    <div className="settings-row">
      <div className="grow">
        <label htmlFor={id}>{label}</label>
        <input
          id={id}
          value={text}
          maxLength={maxLength}
          enterKeyHint="done"
          onChange={(e) => { setEditing(true); setText(e.target.value); }}
          onBlur={commit}
          onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
        />
        {error && <span className="error">{error}</span>}
      </div>
      <Icon name="edit" size={16} className="faint" />
    </div>
  );
}

/** Reparto con el que empiezan los gastos nuevos (por ejemplo 60/40 según los sueldos). */
/** Tu color y tu emoji: salen en tus gastos, en el saldo y en todo lo que haces. */
function Profile({ data, me, reload }: ViewProps) {
  const partner = partnerOf(data.members, me);
  const mine = personColor(data.members, me);
  const theirs = partner ? personColor(data.members, partner.user_id) : null;
  const myMember = data.members.find((m) => m.user_id === me)!;
  const [busy, setBusy] = useState(false);

  async function save(patch: { color?: string; emoji?: string | null }) {
    setBusy(true);
    const { error } = await supabase.from('members').update(patch).eq('user_id', me);
    setBusy(false);
    if (error) return toast(errorMessage(error), 'error');
    toast('Perfil guardado');
    await reload();
  }

  return (
    <section className="settings-group" aria-labelledby="set-profile">
      <h2 id="set-profile">Tu perfil</h2>
      <div className="card stack profile-card">
        <div className="profile-preview">
          <Avatar members={data.members} userId={me} size="lg" />
          <span>
            <strong>{myMember.display_name}</strong>
            <span className="muted small">Así te ve {partner?.display_name ?? 'tu pareja'} en tus gastos y en el saldo.</span>
          </span>
        </div>
        <fieldset className="field">
          <legend className="field-label">Tu color</legend>
          <div className="swatches">
            {PERSON_COLORS.map((c) => {
              const taken = c.value === theirs;
              return (
                <button
                  key={c.value}
                  type="button"
                  className={`swatch person-${c.value}` + (mine === c.value ? ' selected' : '')}
                  aria-pressed={mine === c.value}
                  aria-label={c.label + (taken ? ` (es el de ${partner?.display_name})` : '')}
                  title={taken ? `Es el de ${partner?.display_name}` : c.label}
                  disabled={busy || taken}
                  onClick={() => save({ color: c.value })}
                >
                  {mine === c.value && <Icon name="check" size={16} />}
                </button>
              );
            })}
          </div>
        </fieldset>
        <fieldset className="field">
          <legend className="field-label">En vez de tu inicial</legend>
          <div className="emoji-grid">
            <button type="button" className={'emoji-option' + (!myMember.emoji ? ' selected' : '')} aria-pressed={!myMember.emoji} disabled={busy} onClick={() => save({ emoji: null })}>
              {myMember.display_name.trim().charAt(0).toUpperCase()}
            </button>
            {AVATAR_EMOJIS.map((e) => (
              <button key={e} type="button" className={'emoji-option' + (myMember.emoji === e ? ' selected' : '')} aria-pressed={myMember.emoji === e} disabled={busy} onClick={() => save({ emoji: e })}>
                {e}
              </button>
            ))}
          </div>
        </fieldset>
      </div>
    </section>
  );
}

function DefaultSplit({ data, me, reload, partnerName }: ViewProps & { partnerName: string }) {
  const id = useId();
  const saved = defaultMyPercent(data.household, me, data.members);
  const [value, setValue] = useState(String(saved));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => setValue(String(saved)), [saved]);

  const p = Number(value.trim().replace(',', '.'));
  const valid = value.trim() !== '' && Number.isInteger(p) && p >= 0 && p <= 100;

  async function save(e: FormEvent) {
    e.preventDefault();
    if (!valid) return setError('Escribe un número entero entre 0 y 100');
    setBusy(true);
    setError(null);
    const patch = p === 50 ? { default_split_user: null, default_split_percent: null } : { default_split_user: me, default_split_percent: p };
    const { error } = await supabase.from('households').update(patch).eq('id', data.household.id);
    setBusy(false);
    if (error) return setError(errorMessage(error));
    toast('Reparto guardado');
    await reload();
  }

  return (
    <section className="settings-group" aria-labelledby="set-split">
      <h2 id="set-split">Reparto de los gastos</h2>
      <form className="card stack" onSubmit={save} noValidate>
        <div className="field">
          <label className="field-label" htmlFor={id}>Tu parte de cada gasto nuevo (%)</label>
          <div className="row">
            <input id={id} className="grow" inputMode="numeric" maxLength={3} value={value} onChange={(e) => setValue(e.target.value)} />
            <button className="primary" disabled={busy || !valid || p === saved}>{busy ? 'Guardando…' : 'Guardar'}</button>
          </div>
          <div className="chips" role="group" aria-label="Repartos habituales">
            {[50, 60, 40].map((n) => (
              <button key={n} type="button" className={'chip' + (p === n ? ' selected' : '')} onClick={() => setValue(String(n))}>
                {n === 50 ? 'A medias' : `${n} / ${100 - n}`}
              </button>
            ))}
          </div>
        </div>
        <p className="field-hint">
          {valid ? (p === 50 ? 'Cada gasto nuevo se reparte a medias.' : `A ${partnerName} le toca el ${100 - p} %.`) : 'Escribe un número entre 0 y 100.'}{' '}
          Se puede cambiar en cada gasto, y los que ya están apuntados no cambian.
        </p>
        {error && <p className="error" role="alert">{error}</p>}
      </form>
    </section>
  );
}

function InviteForm({ data, reload }: ViewProps) {
  const id = useId();
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!email.trim()) return setError('Escribe el email de tu pareja');
    setBusy(true);
    setError(null);
    const { error } = await supabase.rpc('invite_partner', { p_email: email });
    setBusy(false);
    if (error) return setError(errorMessage(error));
    setEmail('');
    toast('Invitación guardada');
    await reload();
  }

  return (
    <form onSubmit={submit} className="stack">
      {data.invitation && (
        <Notice icon="mail">
          Invitación pendiente para <strong>{data.invitation.email}</strong>. Pásale el enlace de esta web: al entrar con ese email podrá unirse.
        </Notice>
      )}
      <div className="field">
        <label className="field-label" htmlFor={id}>{data.invitation ? 'Cambiar el email invitado' : 'Email de tu pareja'}</label>
        <input id={id} type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
      </div>
      {error && <p className="error" role="alert">{error}</p>}
      <button className="primary" disabled={busy}><Icon name="mail" size={18} /> {busy ? 'Invitando…' : 'Invitar'}</button>
      <p className="field-hint">El espacio admite como máximo dos personas.</p>
    </form>
  );
}

function Categories({ data, reload }: ViewProps) {
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);

  async function run(p: PromiseLike<{ error: unknown }>, done: string) {
    const { error } = await p;
    setError(error ? errorMessage(error) : null);
    if (!error) toast(done);
    await reload();
  }

  async function add(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    await run(supabase.from('categories').insert({ household_id: data.household.id, name: name.trim() }), 'Categoría añadida');
    setName('');
  }

  async function rename(id: string, current: string) {
    const next = (await askText({ title: 'Cambiar nombre', label: 'Nombre de la categoría', initial: current, maxLength: 40, confirmLabel: 'Guardar' }))?.trim();
    if (next && next !== current) void run(supabase.from('categories').update({ name: next }).eq('id', id), 'Categoría renombrada');
  }

  const sorted = [...data.categories].sort((a, b) => Number(a.archived) - Number(b.archived) || a.name.localeCompare(b.name, 'es'));

  return (
    <section className="settings-group" aria-labelledby="set-categories">
      <h2 id="set-categories">Categorías</h2>
      <ul className="list with-icons">
        {sorted.map((c) => (
          <li key={c.id} className={'row-item' + (c.archived ? ' paused' : '')}>
            <CategoryIcon name={c.name} />
            <button className="row-link grow" onClick={() => rename(c.id, c.name)} aria-label={`Cambiar el nombre de ${c.name}`}>
              <span className="ellipsis">{c.name}</span>
              {c.archived && <span className="tag">Archivada</span>}
            </button>
            <button
              className="icon-btn"
              aria-label={(c.archived ? 'Recuperar ' : 'Archivar ') + c.name}
              title={c.archived ? 'Recuperar' : 'Archivar'}
              onClick={() => run(supabase.from('categories').update({ archived: !c.archived }).eq('id', c.id), c.archived ? 'Categoría recuperada' : 'Categoría archivada')}
            >
              <Icon name={c.archived ? 'undo' : 'archive'} size={18} />
            </button>
          </li>
        ))}
        <li>
          <form onSubmit={add} className="row-item">
            <span className="icon-tile accent"><Icon name="plus" /></span>
            <input className="grow" placeholder="Nueva categoría" aria-label="Nueva categoría" maxLength={40} value={name} onChange={(e) => setName(e.target.value)} enterKeyHint="done" />
            <button className="tinted sm" disabled={!name.trim()}>Añadir</button>
          </form>
        </li>
      </ul>
      {error && <p className="error note" role="alert">{error}</p>}
      <p className="note">Toca un nombre para cambiarlo. Archivar oculta la categoría al añadir gastos, pero conserva el historial.</p>
    </section>
  );
}

function DangerZone({ data, reload }: ViewProps) {
  const [busy, setBusy] = useState(false);

  async function deleteHousehold() {
    const ok = await confirmAction({
      title: '¿Borrar el espacio?',
      message: `Esto borra para siempre "${data.household.name}" con todos sus gastos, reembolsos y presupuestos, para las dos personas. Te recomendamos exportar antes.`,
      confirmLabel: 'Borrar para siempre',
      danger: true,
      typeToConfirm: 'BORRAR',
    });
    if (!ok) return;
    setBusy(true);
    const { error } = await supabase.rpc('delete_household');
    setBusy(false);
    if (error) return toast(errorMessage(error), 'error');
    await reload();
  }

  async function deleteAccount() {
    const ok = await confirmAction({
      title: '¿Borrar tu cuenta?',
      message: 'Esto borra tu cuenta y te saca del espacio. Si eres la última persona, el espacio y todos sus datos se borran también. Te recomendamos exportar antes.',
      confirmLabel: 'Borrar mi cuenta',
      danger: true,
      typeToConfirm: 'BORRAR',
    });
    if (!ok) return;
    setBusy(true);
    const { error } = await supabase.rpc('delete_my_account');
    setBusy(false);
    if (error) return toast(errorMessage(error), 'error');
    await signOut();
  }

  return (
    <section className="settings-group" aria-labelledby="set-danger">
      <h2 id="set-danger">Borrar datos</h2>
      <ul className="list with-icons">
        <li>
          <button className="row-item negative" onClick={deleteHousehold} disabled={busy}>
            <span className="icon-tile negative"><Icon name="trash" /></span>
            <span className="row-main"><span className="row-title">Borrar el espacio y todos sus datos</span></span>
          </button>
        </li>
        <li>
          <button className="row-item negative" onClick={deleteAccount} disabled={busy}>
            <span className="icon-tile negative"><Icon name="user" /></span>
            <span className="row-main"><span className="row-title">Borrar mi cuenta</span></span>
          </button>
        </li>
      </ul>
      <p className="note">Pide escribir BORRAR para confirmar. No se puede deshacer.</p>
    </section>
  );
}
