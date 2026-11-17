import { afterEach, describe, expect, it, vi } from 'vitest';
import { isOfflineError } from './offline';

afterEach(() => vi.unstubAllGlobals());

describe('isOfflineError', () => {
  it('reconoce los fallos de red de cada navegador', () => {
    vi.stubGlobal('navigator', { onLine: true });
    for (const message of ['Failed to fetch', 'NetworkError when attempting to fetch resource.', 'Load failed', 'TypeError: fetch failed']) {
      expect(isOfflineError({ message })).toBe(true);
    }
  });

  it('un error de datos no es por falta de conexión', () => {
    vi.stubGlobal('navigator', { onLine: true });
    expect(isOfflineError({ message: 'violates foreign key constraint' })).toBe(false);
    expect(isOfflineError(null)).toBe(false);
  });

  it('sin conexión en el móvil, cualquier fallo cuenta como tal', () => {
    vi.stubGlobal('navigator', { onLine: false });
    expect(isOfflineError({ message: 'lo que sea' })).toBe(true);
  });
});
