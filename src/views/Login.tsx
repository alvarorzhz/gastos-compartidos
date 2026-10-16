import { useState, type FormEvent } from 'react';
import { errorMessage, supabase } from '../lib/supabase';
import { Notice } from './common';

export default function Login() {
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [withPassword, setWithPassword] = useState(isInstalledIos);
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

  async function signInWithPassword(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    setBusy(false);
    // Si va bien, onAuthStateChange en App muestra la app.
    if (error) setError(/invalid login credentials/i.test(error.message)
      ? 'Email o contraseña incorrectos. Si aún no tienes contraseña, entra con el enlace del correo (en Safari) y créala en Ajustes → Contraseña.'
      : friendlyError(error));
  }

  function switchMode(next: boolean) {
    setWithPassword(next);
    setError(null);
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
    <main className="screen-center">
      <div className="auth">
        <div className="auth-brand">
          <img src="/icon.svg" alt="" />
          <h1>Gastos compartidos</h1>
          <p>Vuestros gastos y vuestro presupuesto, en un mismo sitio.</p>
        </div>
        {sent ? (
          <form onSubmit={verify} className="card stack" noValidate>
            <Notice icon="mail" kind="success">
              Te hemos enviado un correo a <strong>{email}</strong>. Pulsa el enlace que trae para entrar.
            </Notice>
            <div className="field">
              <label className="field-label" htmlFor="login-code">Si el correo trae un código, escríbelo aquí</label>
              <input
                id="login-code"
                className="code-input"
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="[0-9]{6,10}"
                maxLength={10}
                autoFocus
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
              />
            </div>
            {error && <p className="error" role="alert">{error}</p>}
            <button className="primary lg" disabled={busy || code.length < 6}>{busy ? 'Comprobando…' : 'Entrar'}</button>
            <button type="button" className="link-btn small" onClick={() => { setSent(false); setCode(''); setError(null); }}>
              Usar otro email o pedir otro correo
            </button>
          </form>
        ) : withPassword ? (
          <form onSubmit={signInWithPassword} className="card stack" noValidate>
            <div className="field">
              <label className="field-label" htmlFor="login-email">Tu email</label>
              <input id="login-email" type="email" autoComplete="username" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="nombre@ejemplo.com" />
            </div>
            <div className="field">
              <label className="field-label" htmlFor="login-password">Contraseña</label>
              <input id="login-password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
            </div>
            {error && <p className="error" role="alert">{error}</p>}
            <button className="primary lg" disabled={busy || !email.trim() || !password}>{busy ? 'Entrando…' : 'Entrar'}</button>
            <p className="field-hint">¿Aún no tienes contraseña? Entra con el enlace del correo y créala en Ajustes → Contraseña.</p>
            <button type="button" className="link-btn small" onClick={() => switchMode(false)}>Entrar con un enlace por email</button>
          </form>
        ) : (
          <form onSubmit={sendCode} className="card stack" noValidate>
            <div className="field">
              <label className="field-label" htmlFor="login-email">Tu email</label>
              <input id="login-email" type="email" autoComplete="email" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="nombre@ejemplo.com" />
            </div>
            {error && <p className="error" role="alert">{error}</p>}
            <button className="primary lg" disabled={busy || !email.trim()}>{busy ? 'Enviando…' : 'Enviarme un enlace para entrar'}</button>
            <p className="field-hint">Recibirás un enlace (o un código) por email.</p>
            <button type="button" className="link-btn small" onClick={() => switchMode(true)}>Entrar con contraseña</button>
          </form>
        )}
      </div>
    </main>
  );
}

/** En la app instalada de iPhone el enlace del correo abre Safari: ahí se empieza por la contraseña. */
function isInstalledIos(): boolean {
  const standalone = window.matchMedia('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true;
  return standalone && /iphone|ipad|ipod/i.test(navigator.userAgent);
}

function friendlyError(err: unknown): string {
  const msg = errorMessage(err);
  if (/rate limit/i.test(msg)) return 'Se han enviado demasiados correos. Espera un rato (hasta una hora) antes de pedir otro.';
  if (/expired|invalid/i.test(msg)) return 'El código no es válido o ha caducado. Pide uno nuevo.';
  if (/signups? not allowed/i.test(msg)) return 'Este email no tiene acceso a la app.';
  return msg;
}
