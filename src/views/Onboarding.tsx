import { useState, type FormEvent } from 'react';
import { errorMessage, supabase } from '../lib/supabase';
import { signOut } from '../lib/session';
import type { Invitation } from '../lib/types';

interface Props {
  email: string;
  invitation: Invitation | null;
  onDone: () => void;
}

export default function Onboarding({ email, invitation, onDone }: Props) {
  const [name, setName] = useState('');
  const [householdName, setHouseholdName] = useState('Nuestra casa');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error } = invitation
      ? await supabase.rpc('accept_invitation', { p_display_name: name })
      : await supabase.rpc('create_household', { p_name: householdName, p_display_name: name });
    setBusy(false);
    if (error) setError(errorMessage(error));
    else onDone();
  }

  return (
    <main className="screen-center">
      <div className="auth">
        <div className="auth-brand">
          <img src="/icon.svg" alt="" />
          <h1>{invitation ? 'Te están esperando' : 'Bienvenida/o'}</h1>
          <p>{invitation ? 'Te han invitado a un espacio compartido. Solo falta tu nombre para unirte.' : 'Crea vuestro espacio compartido. Después podrás invitar a tu pareja desde Ajustes.'}</p>
        </div>
        <form onSubmit={submit} className="card stack" noValidate>
          {!invitation && (
            <div className="field">
              <label className="field-label" htmlFor="ob-space">Nombre del espacio</label>
              <input id="ob-space" maxLength={60} value={householdName} onChange={(e) => setHouseholdName(e.target.value)} />
            </div>
          )}
          <div className="field">
            <label className="field-label" htmlFor="ob-name">Tu nombre (como lo verá tu pareja)</label>
            <input id="ob-name" maxLength={40} autoComplete="given-name" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          {error && <p className="error" role="alert">{error}</p>}
          <button className="primary lg" disabled={busy || !name.trim() || (!invitation && !householdName.trim())}>
            {busy ? 'Un momento…' : invitation ? 'Unirme' : 'Crear espacio'}
          </button>
        </form>
        <p className="muted small center">
          Has entrado como {email}. <button type="button" className="link-btn small" onClick={() => void signOut()}>Salir</button>
        </p>
      </div>
    </main>
  );
}
