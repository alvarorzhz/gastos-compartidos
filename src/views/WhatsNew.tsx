import { useState } from 'react';
import { APP_VERSION, CHANGELOG, KIND_LABEL } from '../changelog';
import { Notice, Sheet } from './common';
import { Icon } from './icons';

const SEEN_KEY = 'gastos.versionVista';

function readSeen(): string | null {
  try {
    return localStorage.getItem(SEEN_KEY);
  } catch {
    return null;
  }
}

function markSeen() {
  try {
    localStorage.setItem(SEEN_KEY, APP_VERSION);
  } catch {
    // Sin almacenamiento (modo privado): el aviso volverá a salir, no pasa nada.
  }
}

/** Historial completo de versiones. */
export function ChangelogSheet({ onClose }: { onClose: () => void }) {
  return (
    <Sheet title="Novedades" onClose={onClose}>
      {CHANGELOG.map((r) => (
        <section key={r.version} className="release">
          <h3>
            Versión {r.version}
            <span className="muted small"> · {new Date(r.date + 'T12:00:00').toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' })}</span>
          </h3>
          <ul>
            {r.changes.map((c, i) => (
              <li key={i}>
                <span className={'kind kind-' + c.kind}>{KIND_LABEL[c.kind]}</span> <span>{c.text}</span>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </Sheet>
  );
}

/** Aviso que aparece una vez cuando se abre una versión que la persona aún no ha visto. */
export function WhatsNewBanner() {
  const [visible, setVisible] = useState(() => readSeen() !== APP_VERSION);
  const [open, setOpen] = useState(false);
  if (!visible) return null;

  const dismiss = () => {
    markSeen();
    setVisible(false);
    setOpen(false);
  };

  return (
    <>
      <Notice
        icon="sparkles"
        action={
          <span className="row" style={{ gap: 0, margin: '-10px -8px -10px 0' }}>
            <button className="link-btn small" onClick={() => setOpen(true)}>Ver</button>
            <button className="icon-btn" onClick={dismiss} aria-label="Cerrar aviso"><Icon name="close" size={18} /></button>
          </span>
        }
      >
        <strong>Novedades de la versión {APP_VERSION}</strong>
      </Notice>
      {open && <ChangelogSheet onClose={dismiss} />}
    </>
  );
}

/** Tarjeta de Ajustes con la versión actual y acceso al historial. */
export function VersionCard() {
  const [open, setOpen] = useState(false);
  return (
    <section className="settings-group" aria-labelledby="set-version">
      <h2 id="set-version">Versión</h2>
      <ul className="list with-icons">
        <li>
          <button className="row-item" onClick={() => setOpen(true)}>
            <span className="icon-tile accent"><Icon name="sparkles" /></span>
            <span className="row-main"><span className="row-title">Ver novedades</span><span className="row-meta">Estás usando la versión {APP_VERSION}</span></span>
            <Icon name="chevronRight" className="row-chevron" />
          </button>
        </li>
      </ul>
      {open && <ChangelogSheet onClose={() => { markSeen(); setOpen(false); }} />}
    </section>
  );
}
