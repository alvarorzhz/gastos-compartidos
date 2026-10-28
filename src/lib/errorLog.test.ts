import { beforeEach, describe, expect, it, vi } from 'vitest';

const insert = vi.fn(async (_rows: unknown[]) => ({ error: null }));
vi.mock('./supabase', () => ({ supabase: { from: () => ({ insert }) } }));

import { describeError, reportError, resetErrorLog, setErrorContext, worthReporting } from './errorLog';

/** Filas mandadas a app_errors en todos los envíos. */
const sentRows = () => insert.mock.calls.flatMap(([rows]) => rows as { message: string; household_id: string | null; place: string | null }[]);

beforeEach(() => {
  resetErrorLog();
  insert.mockClear();
  vi.stubGlobal('navigator', { onLine: true, userAgent: 'iPhone de pruebas' });
});

describe('qué dice el error', () => {
  it('un Error de JavaScript: mensaje y dónde pasó', () => {
    const d = describeError(new TypeError("Cannot read properties of undefined (reading 'id')"));
    expect(d.message).toBe("Cannot read properties of undefined (reading 'id')");
    expect(d.detail).toContain('TypeError');
  });
  it('un error de Supabase: mensaje y código', () => {
    expect(describeError({ message: 'new row violates row-level security policy', code: '42501', details: null })).toEqual({
      message: 'new row violates row-level security policy',
      detail: '42501',
    });
  });
  it('un texto o cualquier otra cosa', () => {
    expect(describeError('algo raro').message).toBe('algo raro');
    expect(describeError(undefined).message).toBe('Error desconocido');
    expect(describeError({ a: 1 }).message).toBe('{"a":1}');
  });
  it('recorta los mensajes larguísimos', () => {
    expect(describeError(new Error('x'.repeat(2000))).message).toHaveLength(500);
  });
});

describe('qué se apunta', () => {
  it('no apunta la falta de conexión ni el ruido del navegador', () => {
    expect(worthReporting(new TypeError('Failed to fetch'), 'Failed to fetch')).toBe(false);
    expect(worthReporting(null, 'ResizeObserver loop completed with undelivered notifications.')).toBe(false);
    expect(worthReporting(null, 'Script error.')).toBe(false);
    expect(worthReporting(null, "Cannot read properties of undefined (reading 'id')")).toBe(true);
  });

  it('sin red en el móvil no apunta nada', () => {
    vi.stubGlobal('navigator', { onLine: false, userAgent: '' });
    expect(worthReporting(new Error('lo que sea'), 'lo que sea')).toBe(false);
  });
});

describe('guardar los errores', () => {
  it('espera a saber quién usa la app y entonces los guarda con su espacio', async () => {
    reportError(new Error('Al arrancar'), 'inicio');
    expect(insert).not.toHaveBeenCalled();
    setErrorContext('a', 'h');
    await vi.waitFor(() => expect(insert).toHaveBeenCalled());
    expect(sentRows()).toMatchObject([{ message: 'Al arrancar', household_id: 'h', place: 'inicio', app_version: expect.any(String), device: 'iPhone de pruebas' }]);
  });

  it('el mismo error en el mismo sitio se apunta una sola vez', async () => {
    setErrorContext('a', 'h');
    reportError(new Error('Otra vez'), 'gastos');
    reportError(new Error('Otra vez'), 'gastos');
    reportError(new Error('Otra vez'), 'compra');
    await vi.waitFor(() => expect(sentRows()).toHaveLength(2));
    expect(sentRows().map((r) => r.place)).toEqual(['gastos', 'compra']);
  });

  it('como mucho 10 por sesión, aunque algo falle en bucle', async () => {
    setErrorContext('a', 'h');
    for (let i = 0; i < 30; i++) reportError(new Error('Fallo ' + i), 'gastos');
    await vi.waitFor(() => expect(sentRows()).toHaveLength(10));
    await new Promise((r) => setTimeout(r, 10));
    expect(sentRows()).toHaveLength(10);
  });

  it('si no se puede guardar, no se lanza otro error', async () => {
    insert.mockRejectedValueOnce(new Error('sin tabla'));
    setErrorContext('a', 'h');
    expect(() => reportError(new Error('Uno'), 'gastos')).not.toThrow();
    await vi.waitFor(() => expect(insert).toHaveBeenCalled());
  });
});
