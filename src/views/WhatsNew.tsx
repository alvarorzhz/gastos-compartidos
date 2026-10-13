import { useState } from 'react';
import { APP_VERSION, CHANGELOG, KIND_LABEL } from '../changelog';
import { Sheet } from './common';

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
                <span className={'kind kind-' + c.kind}>{KIND_LABEL[c.kind]}</span> {c.text}
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
      <div className="notice row spread">
        <span>✨ Novedades de la versión {APP_VERSION}</span>
        <span className="row">
          <button className="link" onClick={() => setOpen(true)}>Ver</button>
          <button className="icon small" onClick={dismiss} aria-label="Cerrar aviso">✕</button>
        </span>
      </div>
      {open && <ChangelogSheet onClose={dismiss} />}
    </>
  );
}

/** Tarjeta de Ajustes con la versión actual y acceso al historial. */
export function VersionCard() {
  const [open, setOpen] = useState(false);
  return (
    <section className="card">
      <div className="row spread">
        <span>Versión <strong>{APP_VERSION}</strong></span>
        <button className="link" onClick={() => setOpen(true)}>Ver novedades</button>
      </div>
      {open && <ChangelogSheet onClose={() => { markSeen(); setOpen(false); }} />}
    </section>
  );
}
