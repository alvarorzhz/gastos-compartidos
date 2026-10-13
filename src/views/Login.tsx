import { useState, type FormEvent } from 'react';
import { errorMessage, supabase } from '../lib/supabase';

export default function Login() {
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function sendCode(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: window.location.origin + window.location.pathname },
    });
    setBusy(false);
    if (error) setError(friendlyError(error));
    else setSent(true);
  }

  async function verify(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error } = await supabase.auth.verifyOtp({ email: email.trim(), token: code.trim(), type: 'email' });
    setBusy(false);
    // Si va bien, onAuthStateChange en App muestra la app.
    if (error) setError(friendlyError(error));
  }

  return (
    <main className="centered">
      <h1>💶 Gastos compartidos</h1>
      {sent ? (
        <form onSubmit={verify} className="stack">
          <p>Te hemos enviado un código a <strong>{email}</strong>.</p>
          <label>
            Código del correo
            <input
              className="code-input"
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9]{6,10}"
              maxLength={10}
              required
              autoFocus
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
            />
          </label>
          <button className="primary" disabled={busy || code.length < 6}>{busy ? 'Comprobando…' : 'Entrar'}</button>
          {error && <p className="error">{error}</p>}
          <p className="muted small">También puedes pulsar el enlace del correo, si te llega.</p>
          <button type="button" className="link" onClick={() => { setSent(false); setCode(''); setError(null); }}>
            Usar otro email o pedir otro código
          </button>
        </form>
      ) : (
        <form onSubmit={sendCode} className="stack">
          <label>
            Tu email
            <input type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </label>
          <button className="primary" disabled={busy}>{busy ? 'Enviando…' : 'Enviarme un código'}</button>
          {error && <p className="error">{error}</p>}
          <p className="muted small">Sin contraseñas: recibirás un código de acceso por email.</p>
        </form>
      )}
    </main>
  );
}

function friendlyError(err: unknown): string {
  const msg = errorMessage(err);
  if (/rate limit/i.test(msg)) return 'Se han enviado demasiados correos. Espera un rato (hasta una hora) antes de pedir otro código.';
  if (/expired|invalid/i.test(msg)) return 'El código no es válido o ha caducado. Pide uno nuevo.';
  if (/signups? not allowed/i.test(msg)) return 'Este email no tiene acceso a la app.';
  return msg;
}
