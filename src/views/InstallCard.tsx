import { useEffect, useState } from 'react';
import { Icon } from './icons';

interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>;
}

const isStandalone = () =>
  window.matchMedia('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true;
const isIos = () => /iphone|ipad|ipod/i.test(navigator.userAgent);

/** Explica cómo añadir la app a la pantalla de inicio (o muestra el botón en Android/Chrome). */
export default function InstallCard() {
  const [prompt, setPrompt] = useState<InstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(isStandalone);

  useEffect(() => {
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setPrompt(e as InstallPromptEvent);
    };
    const onInstalled = () => setInstalled(true);
    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  if (installed) return null;

  return (
    <section className="settings-group" aria-labelledby="set-install">
      <h2 id="set-install">Instalar en el móvil</h2>
      <div className="card">
        <div className="row" style={{ alignItems: 'flex-start', gap: 'var(--s3)' }}>
          <span className="icon-tile accent"><Icon name="phone" /></span>
          <div className="grow stack-sm">
            {prompt ? (
              <button className="primary" onClick={() => prompt.prompt().then(() => setPrompt(null))}>Añadir a la pantalla de inicio</button>
            ) : isIos() ? (
              <p className="small">En Safari, pulsa <strong>Compartir</strong> (el cuadrado con la flecha) y luego <strong>Añadir a pantalla de inicio</strong>.</p>
            ) : (
              <p className="small">En Chrome, abre el menú <strong>⋮</strong> y pulsa <strong>Añadir a pantalla de inicio</strong> o <strong>Instalar app</strong>.</p>
            )}
            <p className="muted small">Se abrirá a pantalla completa, como una app más.</p>
          </div>
        </div>
      </div>
    </section>
  );
}
