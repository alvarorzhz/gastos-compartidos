import { useState, type FormEvent } from 'react';
import { errorMessage, supabase } from '../lib/supabase';
import { toast } from './common';
import { Icon } from './icons';

/**
 * Ajustes → Contraseña. En iPhone el enlace del correo siempre abre Safari, nunca la app
 * instalada, así que para entrar en la app instalada hace falta una contraseña.
 */
export default function PasswordSettings({ email }: { email: string }) {
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(e: FormEvent) {
    e.preventDefault();
    if (password.length < MIN_LENGTH) return setError(`Usa al menos ${MIN_LENGTH} caracteres.`);
    setBusy(true);
    setError(null);
    const { error } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (error) return setError(passwordError(error));
    setPassword('');
    setOpen(false);
    toast('Contraseña guardada');
  }

  return (
    <section className="settings-group" aria-labelledby="set-password">
      <h2 id="set-password">Contraseña</h2>
      <div className="card stack">
        <div className="row" style={{ alignItems: 'flex-start', gap: 'var(--s3)' }}>
          <span className="icon-tile accent"><Icon name="lock" /></span>
          <div className="grow stack-sm">
            <p className="row-title">Entrar con contraseña</p>
            <p className="muted small">
              En iPhone, el enlace del correo abre Safari y no la app instalada. Crea una contraseña y, en la app instalada, entra con tu email y esta contraseña.
            </p>
          </div>
        </div>
        {open ? (
          <form onSubmit={save} className="stack" noValidate>
            {/* Para que el iPhone guarde la contraseña junto a tu email. */}
            <input type="email" autoComplete="username" value={email} readOnly hidden />
            <div className="field">
              <label className="field-label" htmlFor="new-password">Nueva contraseña</label>
              <input
                id="new-password"
                type={show ? 'text' : 'password'}
                autoComplete="new-password"
                minLength={MIN_LENGTH}
                autoFocus
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              <label className="check-line">
                <input type="checkbox" checked={show} onChange={(e) => setShow(e.target.checked)} /> Ver la contraseña
              </label>
            </div>
            {error && <p className="error" role="alert">{error}</p>}
            <div className="row" style={{ gap: 'var(--s2)' }}>
              <button type="button" className="secondary" onClick={() => { setOpen(false); setPassword(''); setError(null); }}>Cancelar</button>
              <button className="primary grow" disabled={busy || password.length === 0}>{busy ? 'Guardando…' : 'Guardar contraseña'}</button>
            </div>
          </form>
        ) : (
          <button className="secondary" onClick={() => setOpen(true)}>Crear o cambiar contraseña</button>
        )}
      </div>
    </section>
  );
}

export const MIN_LENGTH = 8;

function passwordError(err: unknown): string {
  const msg = errorMessage(err);
  if (/different from the old|same.?password/i.test(msg)) return 'Es la misma contraseña que ya tenías.';
  if (/at least|weak|short/i.test(msg)) return `Esa contraseña es demasiado débil. Usa al menos ${MIN_LENGTH} caracteres, mezclando letras y números.`;
  if (/reauthenticat/i.test(msg)) return 'Por seguridad, cierra sesión, vuelve a entrar con el enlace del correo y créala justo después.';
  return msg;
}
