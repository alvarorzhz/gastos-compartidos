import { beforeEach, describe, expect, it, vi } from 'vitest';

/*
 * Carga de los datos del espacio contra un Supabase de mentira: cada tabla devuelve sus filas
 * (o un error), y las consultas encadenadas (.select().eq().order().range()…) se aceptan tal cual.
 */
type Reply = { rows?: unknown[]; error?: { message: string } };
let tables: Record<string, Reply>;
let rpcError: { message: string } | null;

function builder(table: string) {
  const reply = tables[table] ?? { rows: [] };
  let from = 0;
  let to = Infinity;
  let one: 'single' | 'maybe' | null = null;
  const result = () => {
    if (reply.error) return { data: null, error: reply.error };
    const rows = (reply.rows ?? []).slice(from, to + 1);
    if (one) return { data: rows[0] ?? null, error: null };
    return { data: rows, error: null };
  };
  const q: Record<string, unknown> = {
    select: () => q, eq: () => q, order: () => q, limit: () => q,
    range: (a: number, b: number) => ((from = a), (to = b), q),
    single: () => ((one = 'single'), q),
    maybeSingle: () => ((one = 'maybe'), q),
    then: (ok: (v: unknown) => unknown, ko?: (e: unknown) => unknown) => Promise.resolve(result()).then(ok, ko),
  };
  return q;
}

vi.mock('./supabase', () => ({
  supabase: {
    from: (t: string) => builder(t),
    rpc: async () => ({ data: 0, error: rpcError }),
  },
  errorMessage: (e: unknown) => String((e as { message?: string })?.message ?? e),
}));
vi.mock('./expenseOutbox', () => ({ flushQueued: async () => [] }));
vi.mock('./push', () => ({ notifyNewExpenses: () => {} }));
vi.mock('./errorLog', () => ({ reportError: () => {} }));

const { fetchAll, loadHousehold, readSnapshot, saveSnapshot } = await import('./useHousehold');

const HOUSE = { id: 'h', name: 'Casa', currency: 'EUR', default_split_user: null, default_split_percent: null };

function fullHousehold(): Record<string, Reply> {
  return {
    members: { rows: [{ household_id: 'h', user_id: 'a', display_name: 'Ana' }] },
    households: { rows: [HOUSE] },
    invitations: { rows: [] },
    categories: { rows: [{ id: 'c', household_id: 'h', name: 'Súper', archived: false, alert_percent: 90 }] },
    expenses: { rows: [{ id: 'e1', amount_cents: 1000 }] },
    wishes: { rows: [{ id: 'w1' }] },
  };
}

beforeEach(() => {
  tables = fullHousehold();
  rpcError = null;
});

describe('fetchAll', () => {
  it('lee de 1000 en 1000 hasta la última página', async () => {
    const rows = Array.from({ length: 2345 }, (_, i) => i);
    const calls: [number, number][] = [];
    const res = await fetchAll<number>(async (a, b) => {
      calls.push([a, b]);
      return { data: rows.slice(a, b + 1), error: null };
    });
    expect(res.error).toBeNull();
    expect(res.data).toHaveLength(2345);
    expect(calls).toEqual([[0, 999], [1000, 1999], [2000, 2999]]);
  });

  it('con exactamente 1000 filas pide una página más (vacía) y para', async () => {
    const rows = Array.from({ length: 1000 }, (_, i) => i);
    let calls = 0;
    const res = await fetchAll<number>(async (a, b) => (calls++, { data: rows.slice(a, b + 1), error: null }));
    expect(res.data).toHaveLength(1000);
    expect(calls).toBe(2);
  });

  it('si una página falla, devuelve el error', async () => {
    const res = await fetchAll<number>(async (a) =>
      a === 0 ? { data: Array.from({ length: 1000 }, () => 1), error: null } : { data: null, error: { message: 'caído' } },
    );
    expect(res.error).toEqual({ message: 'caído' });
  });
});

describe('loadHousehold', () => {
  it('carga todo el espacio', async () => {
    const state = await loadHousehold('a');
    expect(state.status).toBe('ready');
    if (state.status !== 'ready') return;
    expect(state.data.household).toEqual(HOUSE);
    expect(state.data.expenses).toEqual([{ id: 'e1', amount_cents: 1000 }]);
    expect(state.data.wishes).toEqual([{ id: 'w1' }]);
    expect(state.data.challenges).toEqual([]);
    expect(state.data.invitation).toBeNull();
  });

  it('sin espacio, devuelve la invitación pendiente', async () => {
    tables = { members: { rows: [] }, invitations: { rows: [{ id: 'i', email: 'x@y.z' }] } };
    expect(await loadHousehold('a')).toEqual({ status: 'no-household', invitation: { id: 'i', email: 'x@y.z' } });
  });

  it('si falla una tabla, falla la carga (no se enseña la sección vacía)', async () => {
    for (const table of ['expenses', 'wishes', 'challenges', 'expense_reactions', 'personal_budgets', 'events', 'wish_votes']) {
      tables = { ...fullHousehold(), [table]: { error: { message: `falla ${table}` } } };
      await expect(loadHousehold('a')).rejects.toEqual({ message: `falla ${table}` });
    }
  });

  it('si fallan los gastos fijos, falla la carga', async () => {
    rpcError = { message: 'sin fijos' };
    await expect(loadHousehold('a')).rejects.toEqual({ message: 'sin fijos' });
  });
});

describe('copia de los datos en el móvil', () => {
  let store: Map<string, string>;
  beforeEach(() => {
    store = new Map();
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
    });
  });

  it('guarda y lee la copia de la misma cuenta, y no la de otra', async () => {
    const state = await loadHousehold('a');
    if (state.status !== 'ready') throw new Error('no cargó');
    saveSnapshot('a', state.data);
    expect(readSnapshot('a')).toEqual(state.data);
    expect(readSnapshot('b')).toBeNull();
  });

  it('una copia antigua sin las listas nuevas se lee con ellas vacías', () => {
    store.set('gastos.copiaDatos', JSON.stringify({ userId: 'a', data: { household: HOUSE, expenses: [] } }));
    const copy = readSnapshot('a');
    expect(copy?.wishes).toEqual([]);
    expect(copy?.wishVotes).toEqual([]);
    expect(copy?.challenges).toEqual([]);
    expect(copy?.events).toEqual([]);
  });

  it('una copia estropeada o sin almacenamiento no rompe nada', () => {
    store.set('gastos.copiaDatos', '{no es json');
    expect(readSnapshot('a')).toBeNull();
    vi.stubGlobal('localStorage', {
      getItem: () => { throw new Error('bloqueado'); },
      setItem: () => { throw new Error('lleno'); },
    });
    expect(readSnapshot('a')).toBeNull();
    expect(() => saveSnapshot('a', {} as never)).not.toThrow();
  });
});
