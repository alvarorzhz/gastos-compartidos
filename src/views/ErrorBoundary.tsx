import { Component, type ReactNode } from 'react';
import { reportError } from '../lib/errorLog';
import { Icon } from './icons';

/** Si una pantalla falla al pintarse, en vez de quedarse en blanco se explica y se apunta el error. */
export default class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: unknown) {
    reportError(error);
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <main className="screen-center" role="alert">
        <span className="empty-icon"><Icon name="alert" size={26} /></span>
        <h1 className="empty-title">Algo ha fallado</h1>
        <p className="muted small">Tus datos están bien. Vuelve a cargar la app; si se repite, lo verás apuntado en Ajustes → Tus datos → Errores de la app.</p>
        <button className="primary" onClick={() => location.reload()}>Volver a cargar</button>
      </main>
    );
  }
}
