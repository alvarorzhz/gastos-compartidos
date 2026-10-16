import { useEffect, useState } from 'react';
import { currentSubscription, disablePush, enablePush, pushSupport, savedPrefs, savePrefs, testPush, type PushPrefs } from '../lib/push';
import { Notice, Spinner, toast } from './common';
import { Icon } from './icons';

/** Ajustes → Avisos en el móvil: activar, elegir qué avisos y probar. */
export default function PushSettings({ hasPartner }: { hasPartner: boolean }) {
  const support = pushSupport();
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [prefs, setPrefs] = useState<PushPrefs>({ expenses: true, budget: true });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    void (async () => {
      const sub = await currentSubscription().catch(() => null);
      if (!alive) return;
      setEnabled(sub != null);
      if (sub) {
        const p = await savedPrefs(sub.endpoint).catch(() => null);
        if (alive && p) setPrefs(p);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  async function turnOn() {
    setBusy(true);
    setError(null);
    const err = await enablePush(prefs);
    setBusy(false);
    if (err) return setError(err);
    setEnabled(true);
    toast('Avisos activados');
  }

  async function turnOff() {
    setBusy(true);
    setError(null);
    await disablePush().catch(() => undefined);
    setBusy(false);
    setEnabled(false);
    toast('Avisos desactivados');
  }

  async function change(next: PushPrefs) {
    setPrefs(next);
    const sub = await currentSubscription();
    if (!sub) return;
    const err = await savePrefs(sub, next);
    if (err) setError(err);
  }

  async function test() {
    setError(null);
    const err = await testPush();
    if (err) setError(err);
    else toast('Aviso de prueba enviado', 'info');
  }

  return (
    <section className="settings-group" aria-labelledby="set-push">
      <h2 id="set-push">Avisos en el móvil</h2>
      <div className="card stack">
        <div className="row" style={{ alignItems: 'flex-start', gap: 'var(--s3)' }}>
          <span className="icon-tile accent"><Icon name="bell" /></span>
          <div className="grow stack-sm">
            <p className="row-title">Que el móvil te avise</p>
            <p className="muted small">
              {hasPartner ? 'Cuando tu pareja apunte un gasto y ' : ''}cuando un presupuesto llegue a su aviso, aunque la app esté cerrada. Se activa en cada móvil.
            </p>
          </div>
        </div>

        {support === 'install-first' && (
          <Notice icon="phone">En iPhone, los avisos solo funcionan con la app instalada. Instálala arriba («Instalar en el móvil») y ábrela desde su icono para activarlos.</Notice>
        )}
        {support === 'unsupported' && <Notice>Este navegador no permite avisos. Prueba desde Chrome o Safari en el móvil.</Notice>}

        {support === 'ok' && enabled == null && <Spinner label="Comprobando…" />}

        {support === 'ok' && enabled != null && (
          <>
            {hasPartner && (
              <label className="check-line">
                <input type="checkbox" checked={prefs.expenses} disabled={busy} onChange={(e) => void change({ ...prefs, expenses: e.target.checked })} />
                Cuando tu pareja apunte un gasto
              </label>
            )}
            <label className="check-line">
              <input type="checkbox" checked={prefs.budget} disabled={busy} onChange={(e) => void change({ ...prefs, budget: e.target.checked })} />
              Cuando un presupuesto llegue a su aviso
            </label>
            <div className="row wrap">
              {enabled ? (
                <>
                  <button className="secondary" onClick={test} disabled={busy}>Enviar aviso de prueba</button>
                  <button className="secondary" onClick={turnOff} disabled={busy}>Desactivar</button>
                </>
              ) : (
                <button className="primary" onClick={turnOn} disabled={busy}>{busy ? 'Activando…' : 'Activar avisos'}</button>
              )}
            </div>
          </>
        )}
        {error && <p className="error" role="alert">{error}</p>}
      </div>
    </section>
  );
}
