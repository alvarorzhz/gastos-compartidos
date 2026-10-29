import { describe, expect, it } from 'vitest';
import { goodConnection, shouldReloadForNewVersion } from './lazyView';

function memoryStorage() {
  const map = new Map<string, string>();
  return { getItem: (k: string) => map.get(k) ?? null, setItem: (k: string, v: string) => void map.set(k, v) };
}

describe('goodConnection', () => {
  it('da por buena la conexión si el móvil no dice nada (iPhone)', () => {
    expect(goodConnection(undefined)).toBe(true);
  });
  it('sin conexión no descarga nada', () => {
    expect(goodConnection(undefined, false)).toBe(false);
  });
  it('con 4G sí, con 3G o peor no', () => {
    expect(goodConnection({ effectiveType: '4g' })).toBe(true);
    expect(goodConnection({ effectiveType: '3g' })).toBe(false);
    expect(goodConnection({ effectiveType: '2g' })).toBe(false);
    expect(goodConnection({ effectiveType: 'slow-2g' })).toBe(false);
  });
  it('respeta el ahorro de datos', () => {
    expect(goodConnection({ effectiveType: '4g', saveData: true })).toBe(false);
  });
});

describe('shouldReloadForNewVersion', () => {
  it('recarga solo una vez por sesión', () => {
    const storage = memoryStorage();
    expect(shouldReloadForNewVersion(true, storage)).toBe(true);
    expect(shouldReloadForNewVersion(true, storage)).toBe(false);
  });
  it('sin conexión no recarga', () => {
    expect(shouldReloadForNewVersion(false, memoryStorage())).toBe(false);
  });
});
