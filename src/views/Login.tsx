import { useState, type FormEvent } from 'react';
import { errorMessage, supabase } from '../lib/supabase';

export default function Login() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: window.location.origin + window.location.pathname },
    });
    setBusy(false);
    if (error) setError(errorMessage(error));
    else setSent(true);
  }

  return (
    <main className="centered">
      <h1>💶 Gastos compartidos</h1>
      {sent ? (
        <>
          <p>Te hemos enviado un enlace a <strong>{email}</strong>. Ábrelo en este dispositivo para entrar.</p>
          <button className="link" onClick={() => setSent(false)}>Usar otro email</button>
        </>
      ) : (
        <form onSubmit={submit} className="stack">
          <label>
            Tu email
            <input type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </label>
          <button className="primary" disabled={busy}>{busy ? 'Enviando…' : 'Enviarme un enlace para entrar'}</button>
          {error && <p className="error">{error}</p>}
          <p className="muted small">Sin contraseñas: recibirás un enlace de acceso por email.</p>
        </form>
      )}
    </main>
  );
}
