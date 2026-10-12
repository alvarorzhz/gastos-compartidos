import { useState, type FormEvent } from 'react';
import { errorMessage, supabase } from '../lib/supabase';
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
    <main className="centered">
      <h1>Bienvenida/o</h1>
      <form onSubmit={submit} className="stack">
        {invitation ? (
          <p>Te han invitado a un espacio compartido. Solo falta tu nombre para unirte.</p>
        ) : (
          <>
            <p>Crea vuestro espacio compartido. Después podrás invitar a tu pareja desde Ajustes.</p>
            <label>
              Nombre del espacio
              <input required maxLength={60} value={householdName} onChange={(e) => setHouseholdName(e.target.value)} />
            </label>
          </>
        )}
        <label>
          Tu nombre (como lo verá tu pareja)
          <input required maxLength={40} autoComplete="given-name" value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <button className="primary" disabled={busy}>{invitation ? 'Unirme' : 'Crear espacio'}</button>
        {error && <p className="error">{error}</p>}
        <p className="muted small">
          Has entrado como {email}. <button type="button" className="link" onClick={() => supabase.auth.signOut()}>Salir</button>
        </p>
      </form>
    </main>
  );
}
