import { lazy, type ComponentType } from 'react';

/*
 * Pantallas que se cargan por partes.
 *
 * Al entrar solo hace falta Inicio; el resto de secciones viven en archivos aparte. Con buena
 * cobertura se descargan todas justo después de abrir la app (así cambiar de sección es
 * inmediato y quedan guardadas en el móvil para usarlas sin conexión). Con poca cobertura o
 * con el «ahorro de datos» del móvil, cada una se baja solo cuando se abre.
 */

export interface LazyView<P> {
  Component: ComponentType<P>;
  preload: () => Promise<unknown>;
}

const RELOADED_KEY = 'gastos.recargaPorVersion';

/** Si falla la descarga de una parte con conexión, casi siempre es que hay versión nueva: se recarga una vez. */
export function shouldReloadForNewVersion(online: boolean, storage: Pick<Storage, 'getItem' | 'setItem'> | null): boolean {
  if (!online || !storage) return false;
  try {
    if (storage.getItem(RELOADED_KEY)) return false;
    storage.setItem(RELOADED_KEY, '1');
    return true;
  } catch {
    return false;
  }
}

function sessionStore(): Storage | null {
  try {
    return sessionStorage;
  } catch {
    return null;
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function lazyView<P extends Record<string, any>>(load: () => Promise<{ default: ComponentType<P> }>): LazyView<P> {
  let pending: Promise<{ default: ComponentType<P> }> | null = null;
  const loadOnce = () =>
    (pending ??= load().then((mod) => {
      try {
        sessionStore()?.removeItem(RELOADED_KEY); // ya está al día: otra versión nueva podrá recargar
      } catch {
        // sin almacenamiento no pasa nada
      }
      return mod;
    }).catch((err: unknown) => {
      pending = null; // para poder reintentar
      if (shouldReloadForNewVersion(navigator.onLine, sessionStore())) location.reload();
      throw err;
    }));
  return { Component: lazy(loadOnce), preload: () => loadOnce().catch(() => undefined) };
}

interface ConnectionInfo {
  saveData?: boolean;
  effectiveType?: string;
}

/** ¿Hay cobertura suficiente para bajarlo todo al entrar? Si el móvil no lo dice (iPhone), se da por buena. */
export function goodConnection(connection: ConnectionInfo | undefined, online = true): boolean {
  if (!online) return false;
  if (!connection) return true;
  if (connection.saveData) return false;
  return !['slow-2g', '2g', '3g'].includes(connection.effectiveType ?? '');
}

/** Con buena cobertura, descarga el resto de pantallas cuando la app ya se ha pintado. */
export function preloadWhenGood(views: { preload: () => Promise<unknown> }[]): void {
  const nav = navigator as Navigator & { connection?: ConnectionInfo };
  if (!goodConnection(nav.connection, nav.onLine)) return;
  const run = () => {
    for (const v of views) void v.preload();
  };
  const idle = (window as Window & { requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number }).requestIdleCallback;
  if (idle) idle(run, { timeout: 2000 });
  else setTimeout(run, 300);
}
