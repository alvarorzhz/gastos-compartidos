import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Expense } from './types';

// Lo que devuelve Supabase a cada envío, en orden; sin nada, el envío va bien.
const replies: { error: { message: string } | null }[] = [];
const upsert = vi.fn(async (_row: unknown, _opts: unknown) => replies.shift() ?? { error: null });
vi.mock('./supabase', () => ({ supabase: { from: () => ({ upsert }) } }));

const KEY = 'gastos.gastosSinSubir';
let store: Map<string, string>;

function fakeStorage() {
  return {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  };
}

/** El módulo lee lo guardado al cargarse: cada prueba lo carga de nuevo, como al abrir la app. */
async function load() {
  vi.resetModules();
  return await import('./expenseOutbox');
}

function expense(id: string, fields: Partial<Expense> = {}): Expense {
  return {
    id, household_id: 'h', amount_cents: 1000, spent_on: '2026-10-05', category_id: 'c', paid_by: 'a',
    owed_cents: null, note: null, recurring_id: null, created_by: 'a', created_at: 'ahora', updated_at: 'ahora', ...fields,
  };
}

beforeEach(() => {
  store = new Map();
  replies.length = 0;
  upsert.mockClear();
  vi.stubGlobal('localStorage', fakeStorage());
  vi.stubGlobal('navigator', { onLine: true });
});

describe('guardar sin conexión', () => {
  it('lo guardado sigue ahí al volver a abrir la app', async () => {
    (await load()).queueExpense('a', expense('e1'));
    const outbox = await load();
    expect(outbox.isQueued('e1')).toBe(true);
    expect(outbox.queuedExpenses('a', 'h').map((e) => e.id)).toEqual(['e1']);
  });

  it('guardar dos veces el mismo gasto no lo duplica', async () => {
    const outbox = await load();
    outbox.queueExpense('a', expense('e1', { amount_cents: 100 }));
    outbox.queueExpense('a', expense('e1', { amount_cents: 200 }));
    expect(outbox.queuedExpenses('a', 'h')).toHaveLength(1);
    expect(outbox.queuedExpenses('a', 'h')[0].amount_cents).toBe(200);
  });

  it('cada cuenta y cada espacio ven solo lo suyo', async () => {
    const outbox = await load();
    outbox.queueExpense('a', expense('e1'));
    outbox.queueExpense('b', expense('e2'));
    outbox.queueExpense('a', expense('e3', { household_id: 'otro' }));
    expect(outbox.queuedExpenses('a', 'h').map((e) => e.id)).toEqual(['e1']);
    expect(outbox.queuedExpenses('b', 'h').map((e) => e.id)).toEqual(['e2']);
  });

  it('editar y borrar un gasto pendiente', async () => {
    const outbox = await load();
    outbox.queueExpense('a', expense('e1'));
    outbox.updateQueued('e1', { note: 'Pan' });
    expect(outbox.queuedExpenses('a', 'h')[0].note).toBe('Pan');
    outbox.removeQueued('e1');
    expect(outbox.isQueued('e1')).toBe(false);
    expect(store.has(KEY)).toBe(false);
  });

  it('lo guardado roto no rompe la app', async () => {
    store.set(KEY, '{esto no es json');
    expect((await load()).queuedExpenses('a', 'h')).toEqual([]);
    store.set(KEY, JSON.stringify([null, { userId: 'a' }, { userId: 'a', row: expense('e1') }]));
    expect((await load()).queuedExpenses('a', 'h').map((e) => e.id)).toEqual(['e1']);
  });

  it('sin almacenamiento, el gasto sigue en pantalla mientras la app esté abierta', async () => {
    vi.stubGlobal('localStorage', { getItem: () => { throw new Error('bloqueado'); }, setItem: () => { throw new Error('bloqueado'); }, removeItem: () => {} });
    const outbox = await load();
    outbox.queueExpense('a', expense('e1'));
    expect(outbox.isQueued('e1')).toBe(true);
  });
});

describe('subir al volver la conexión', () => {
  it('sube lo de esta cuenta, sin las fechas que pone la base de datos, y lo quita de la cola', async () => {
    const outbox = await load();
    outbox.queueExpense('a', expense('e1'));
    outbox.queueExpense('b', expense('e2'));
    expect(await outbox.flushQueued('a')).toEqual(['e1']);
    expect(upsert).toHaveBeenCalledTimes(1);
    const [row, opts] = upsert.mock.calls[0];
    expect(row).not.toHaveProperty('created_at');
    expect(row).not.toHaveProperty('updated_at');
    expect(row).toMatchObject({ id: 'e1', amount_cents: 1000 });
    // Si el envío ya había llegado, no se duplica.
    expect(opts).toEqual({ onConflict: 'id', ignoreDuplicates: true });
    expect(outbox.isQueued('e1')).toBe(false);
    expect(outbox.isQueued('e2')).toBe(true);
  });

  it('si se corta la conexión a mitad, se para y lo que falta sigue pendiente', async () => {
    const outbox = await load();
    ['e1', 'e2', 'e3'].forEach((id) => outbox.queueExpense('a', expense(id)));
    replies.push({ error: null }, { error: { message: 'TypeError: Failed to fetch' } });
    expect(await outbox.flushQueued('a')).toEqual(['e1']);
    expect(upsert).toHaveBeenCalledTimes(2);
    expect(outbox.queuedExpenses('a', 'h').map((e) => e.id)).toEqual(['e2', 'e3']);
  });

  it('un gasto que no vale (p. ej. categoría borrada) se queda para corregirlo, y los demás suben', async () => {
    const outbox = await load();
    outbox.queueExpense('a', expense('e1'));
    outbox.queueExpense('a', expense('e2'));
    replies.push({ error: { message: 'violates foreign key constraint' } });
    expect(await outbox.flushQueued('a')).toEqual(['e2']);
    expect(outbox.queuedExpenses('a', 'h').map((e) => e.id)).toEqual(['e1']);
  });

  it('dos subidas a la vez no mandan dos veces lo mismo', async () => {
    const outbox = await load();
    outbox.queueExpense('a', expense('e1'));
    const [first, second] = await Promise.all([outbox.flushQueued('a'), outbox.flushQueued('a')]);
    expect(first).toEqual(['e1']);
    expect(second).toEqual([]);
    expect(upsert).toHaveBeenCalledTimes(1);
  });
});

describe('errores de conexión', () => {
  it('distingue la falta de conexión de un dato no válido', async () => {
    const { isOfflineError } = await load();
    expect(isOfflineError({ message: 'TypeError: Load failed' })).toBe(true);
    expect(isOfflineError({ message: 'NetworkError when attempting to fetch resource.' })).toBe(true);
    expect(isOfflineError({ message: 'violates check constraint' })).toBe(false);
    expect(isOfflineError(null)).toBe(false);
  });

  it('sin red en el móvil, cualquier error cuenta como falta de conexión', async () => {
    vi.stubGlobal('navigator', { onLine: false });
    const { isOfflineError } = await load();
    expect(isOfflineError({ message: 'lo que sea' })).toBe(true);
  });
});

describe('ver los pendientes con los demás gastos', () => {
  it('añade los pendientes que aún no están, ordenados por fecha', async () => {
    const outbox = await load();
    outbox.queueExpense('a', expense('nuevo', { spent_on: '2026-10-07' }));
    outbox.queueExpense('a', expense('ya-subido', { spent_on: '2026-10-06' }));
    const data = { household: { id: 'h' }, expenses: [expense('ya-subido', { spent_on: '2026-10-06' }), expense('viejo', { spent_on: '2026-10-01' })] };
    expect(outbox.withQueued(data, 'a').expenses.map((e) => e.id)).toEqual(['nuevo', 'ya-subido', 'viejo']);
  });

  it('sin pendientes devuelve los mismos datos', async () => {
    const outbox = await load();
    const data = { household: { id: 'h' }, expenses: [] };
    expect(outbox.withQueued(data, 'a')).toBe(data);
  });
});
