import { describe, expect, it } from 'vitest';
import { conflictTitle, editState } from './editConflict';
import type { Member } from './types';

const members = [
  { user_id: 'yo', display_name: 'Álvaro' },
  { user_id: 'ella', display_name: 'Patri' },
] as Member[];

describe('editState', () => {
  const base = { updated_at: '2026-11-22T21:00:00.123456+00:00' };
  it('igual si nadie lo ha tocado', () => {
    expect(editState(base, { updated_at: '2026-11-22T21:00:00.123456+00:00' })).toBe('same');
  });
  it('igual aunque la hora venga escrita de otra forma', () => {
    expect(editState(base, { updated_at: '2026-11-22T21:00:00.123456Z' })).toBe('same');
  });
  it('cambiado si la hora del último cambio es otra', () => {
    expect(editState(base, { updated_at: '2026-11-22T21:05:00.000001+00:00' })).toBe('changed');
  });
  it('cambiado aunque solo difieran las millonésimas', () => {
    expect(editState(base, { updated_at: '2026-11-22T21:00:00.123457+00:00' })).toBe('changed');
  });
  it('borrado si ya no está', () => {
    expect(editState(base, undefined)).toBe('deleted');
    expect(editState(base, null)).toBe('deleted');
  });
});

describe('conflictTitle', () => {
  it('nombra a la pareja', () => {
    expect(conflictTitle('changed', 'ella', members, 'yo')).toBe('Patri ha cambiado este gasto');
    expect(conflictTitle('deleted', 'ella', members, 'yo')).toBe('Patri ha borrado este gasto');
  });
  it('desde otro móvil si fuiste tú', () => {
    expect(conflictTitle('changed', 'yo', members, 'yo')).toBe('Has cambiado este gasto desde otro móvil');
  });
  it('la app si lo cambió sola', () => {
    expect(conflictTitle('changed', null, members, 'yo')).toBe('La app ha cambiado este gasto');
  });
  it('la pareja si no se sabe quién', () => {
    expect(conflictTitle('deleted', undefined, members, 'yo')).toBe('Patri ha borrado este gasto');
  });
});
