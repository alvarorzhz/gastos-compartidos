import { describe, expect, it, vi } from 'vitest';
import { backupHealth, latest, staleText } from './backupHealth';

vi.mock('./supabase', () => ({ supabase: {} }));

const now = new Date('2026-11-17T21:00:00Z');

describe('backupHealth', () => {
  it('sin copias todavía no avisa', () => {
    expect(backupHealth(null, now)).toBeNull();
    expect(backupHealth('no es fecha', now)).toBeNull();
  });

  it('la copia de esta noche está bien', () => {
    expect(backupHealth('2026-11-17T03:00:00Z', now)).toEqual({ days: 0, stale: false });
  });

  it('si falla una sola noche, aún no avisa', () => {
    expect(backupHealth('2026-11-16T03:00:00Z', now)).toEqual({ days: 1, stale: false });
  });

  it('dos noches sin copia: avisa', () => {
    expect(backupHealth('2026-11-15T03:00:00Z', now)).toEqual({ days: 2, stale: true });
  });

  it('el aviso dice cuántos días', () => {
    expect(staleText({ days: 3, stale: true })).toContain('hace 3 días');
    expect(staleText({ days: 1, stale: true })).toContain('hace 1 día.');
  });
});

describe('latest', () => {
  it('elige la más reciente aunque vengan desordenadas', () => {
    expect(latest(['2026-11-10T03:00:00Z', '2026-11-17T03:00:00Z', null, '2026-11-12T03:00:00Z'])).toBe('2026-11-17T03:00:00Z');
    expect(latest([])).toBeNull();
  });
});
