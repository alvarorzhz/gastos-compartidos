import { useState, type FormEvent } from 'react';
import { exportCsv, exportJson } from '../lib/exportData';
import { partnerOf } from '../lib/people';
import { errorMessage, supabase } from '../lib/supabase';
import type { ViewProps } from './common';
import InstallCard from './InstallCard';
import { VersionCard } from './WhatsNew';

export default function SettingsView(props: ViewProps & { email: string }) {
  const { data, me, reload, email } = props;
  const partner = partnerOf(data.members, me);
  const myMember = data.members.find((m) => m.user_id === me)!;

  return (
    <>
      <section className="card">
        <h3>Vuestro espacio</h3>
        <InlineText
          label="Nombre del espacio"
          value={data.household.name}
          maxLength={60}
          onSave={(name) => supabase.from('households').update({ name }).eq('id', data.household.id)}
          reload={reload}
        />
        <InlineText
          label="Tu nombre"
          value={myMember.display_name}
          maxLength={40}
          onSave={(display_name) => supabase.from('members').update({ display_name }).eq('user_id', me)}
          reload={reload}
        />
        <p className="muted small">Has entrado como {email}.</p>
      </section>

      <InstallCard />

      <section className="card">
        <h3>Tu pareja</h3>
        {partner ? (
          <p>{partner.display_name} ya forma parte del espacio. Solo vosotros dos podéis ver estos datos.</p>
        ) : (
          <InviteForm {...props} />
        )}
      </section>

      <Categories {...props} />

      <section className="card">
        <h3>Tus datos</h3>
        <p className="muted small">Descarga todo lo que hay en el espacio: gastos, reembolsos, presupuestos y categorías.</p>
        <div className="row wrap">
          <button className="secondary" onClick={() => exportCsv(data)}>Exportar CSV (Excel)</button>
          <button className="secondary" onClick={() => exportJson(data)}>Exportar JSON</button>
        </div>
      </section>

      <DangerZone {...props} />

      <VersionCard />

      <button className="secondary full" onClick={() => supabase.auth.signOut()}>Cerrar sesión</button>
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
  const [text, setText] = useState(value);
  const [error, setError] = useState<string | null>(null);
  async function commit() {
    const v = text.trim();
    if (!v || v === value) return setText(value);
    const { error } = await onSave(v);
    if (error) setError(errorMessage(error));
    else await reload();
  }
  return (
    <label>
      {label}
      <input value={text} maxLength={maxLength} onChange={(e) => setText(e.target.value)} onBlur={commit} />
      {error && <span className="error small">{error}</span>}
    </label>
  );
}

function InviteForm({ data, reload }: ViewProps) {
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error } = await supabase.rpc('invite_partner', { p_email: email });
    setBusy(false);
    if (error) return setError(errorMessage(error));
    setEmail('');
    await reload();
  }

  return (
    <form onSubmit={submit} className="stack">
      {data.invitation && (
        <p className="notice">
          Invitación pendiente para <strong>{data.invitation.email}</strong>. Pásale el enlace de esta web: al entrar con ese email podrá unirse.
        </p>
      )}
      <label>
        {data.invitation ? 'Cambiar el email invitado' : 'Email de tu pareja'}
        <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
      </label>
      <button className="primary" disabled={busy}>Invitar</button>
      {error && <p className="error">{error}</p>}
      <p className="muted small">El espacio admite como máximo dos personas.</p>
    </form>
  );
}

function Categories({ data, reload }: ViewProps) {
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);

  async function run(p: PromiseLike<{ error: unknown }>) {
    const { error } = await p;
    setError(error ? errorMessage(error) : null);
    await reload();
  }

  async function add(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    await run(supabase.from('categories').insert({ household_id: data.household.id, name: name.trim() }));
    setName('');
  }

  function rename(id: string, current: string) {
    const next = prompt('Nuevo nombre de la categoría', current)?.trim();
    if (next && next !== current) void run(supabase.from('categories').update({ name: next }).eq('id', id));
  }

  return (
    <section className="card">
      <h3>Categorías</h3>
      <ul className="chips">
        {data.categories.map((c) => (
          <li key={c.id} className={c.archived ? 'archived' : ''}>
            <button className="link" onClick={() => rename(c.id, c.name)}>{c.name}</button>
            <button
              className="icon small"
              title={c.archived ? 'Recuperar' : 'Archivar'}
              aria-label={(c.archived ? 'Recuperar ' : 'Archivar ') + c.name}
              onClick={() => run(supabase.from('categories').update({ archived: !c.archived }).eq('id', c.id))}
            >
              {c.archived ? '↺' : '✕'}
            </button>
          </li>
        ))}
      </ul>
      <form onSubmit={add} className="row">
        <input className="grow" placeholder="Nueva categoría" maxLength={40} value={name} onChange={(e) => setName(e.target.value)} />
        <button className="secondary">Añadir</button>
      </form>
      <p className="muted small">Archivar oculta la categoría al añadir gastos, pero conserva el historial.</p>
      {error && <p className="error">{error}</p>}
    </section>
  );
}

function DangerZone({ data, reload }: ViewProps) {
  const [busy, setBusy] = useState(false);

  async function deleteHousehold() {
    const typed = prompt(
      `Esto borra para siempre el espacio "${data.household.name}" con todos sus gastos, reembolsos y presupuestos, para las dos personas.\n\nEscribe BORRAR para confirmar.`,
    );
    if (typed?.trim().toUpperCase() !== 'BORRAR') return;
    setBusy(true);
    const { error } = await supabase.rpc('delete_household');
    setBusy(false);
    if (error) return alert(errorMessage(error));
    await reload();
  }

  async function deleteAccount() {
    const typed = prompt(
      'Esto borra tu cuenta y te saca del espacio. Si eres la última persona, el espacio y todos sus datos se borran también. Te recomendamos exportar antes.\n\nEscribe BORRAR para confirmar.',
    );
    if (typed?.trim().toUpperCase() !== 'BORRAR') return;
    setBusy(true);
    const { error } = await supabase.rpc('delete_my_account');
    setBusy(false);
    if (error) return alert(errorMessage(error));
    await supabase.auth.signOut();
  }

  return (
    <section className="card danger-zone">
      <h3>Borrar datos</h3>
      <button className="danger full" onClick={deleteHousehold} disabled={busy}>Borrar el espacio y todos sus datos</button>
      <button className="danger full" onClick={deleteAccount} disabled={busy}>Borrar mi cuenta</button>
    </section>
  );
}
