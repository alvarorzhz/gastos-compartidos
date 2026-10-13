import { describe, expect, it } from 'vitest';
import { addDays, formatDayHeading, formatShortDay } from './dates';

describe('fechas', () => {
  it('suma días cambiando de mes', () => {
    expect(addDays('2026-10-01', -1)).toBe('2026-09-30');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
  });

  it('pone Hoy y Ayer en los encabezados', () => {
    expect(formatDayHeading('2026-10-13', '2026-10-13')).toBe('Hoy');
    expect(formatDayHeading('2026-10-12', '2026-10-13')).toBe('Ayer');
    expect(formatDayHeading('2026-10-05', '2026-10-13')).toMatch(/^Lunes, 5 de octubre$/);
    expect(formatDayHeading('2025-10-05', '2026-10-13')).toContain('2025');
  });

  it('fecha corta con año solo si no es el actual', () => {
    expect(formatShortDay('2026-10-05', '2026-10-13')).not.toContain('2026');
    expect(formatShortDay('2025-10-05', '2026-10-13')).toContain('2025');
  });
});
