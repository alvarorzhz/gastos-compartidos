import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { installErrorLog } from './lib/errorLog';
import ErrorBoundary from './views/ErrorBoundary';
import './styles.css';

installErrorLog();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
);

// Guarda la app en el móvil (para abrirla sin conexión) y permite los avisos.
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => undefined);
  });
}
