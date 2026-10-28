import type { Page, Route } from '@playwright/test';
import { readFileSync } from 'node:fs';

/*
 * Un Supabase de mentira para las pruebas de pantallas: guarda las tablas en memoria y
 * responde como PostgREST lo justo para que la app funcione. Nada sale a internet.
 */

export const ANA = '00000000-0000-0000-0000-00000000000a';
export const BEA = '00000000-0000-0000-0000-00000000000b';
export const HOME = '11111111-1111-1111-1111-111111111111';
const version = (JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as { version: string }).version;

type Row = Record<string, unknown>;
export type Tables = Record<string, Row[]>;

const now = new Date();
const iso = (d: Date) => d.toISOString();
const day = (offset = 0) => {
  const d = new Date(now);
  d.setDate(Math.max(1, d.getDate() + offset));
  return iso(d).slice(0, 10);
};
const cat = (id: string, name: string): Row => ({ id, household_id: HOME, name, archived: false, alert_percent: 90, created_at: iso(now) });
const expense = (id: string, amount_cents: number, note: string, category_id: string, paid_by: string, offset = 0): Row => ({
  id, household_id: HOME, amount_cents, spent_on: day(offset), category_id, paid_by, owed_cents: null, note,
  recurring_id: null, event_id: null, created_by: paid_by, created_at: iso(now), updated_at: iso(now),
});

/** Un espacio con Ana y Bea, unos gastos de este mes y algo en la lista de la compra. */
export function sampleData(): Tables {
  return {
    households: [{ id: HOME, name: 'Casa', currency: 'EUR', default_split_user: null, default_split_percent: null }],
    members: [
      { household_id: HOME, user_id: ANA, display_name: 'Ana', joined_at: '2026-01-01T00:00:00Z', color: null, emoji: null },
      { household_id: HOME, user_id: BEA, display_name: 'Bea', joined_at: '2026-01-02T00:00:00Z', color: null, emoji: null },
    ],
    invitations: [],
    categories: [cat('c-super', 'Supermercado'), cat('c-casa', 'Casa'), cat('c-ocio', 'Ocio')],
    expenses: [
      expense('e-1', 5420, 'Mercadona', 'c-super', ANA, 0),
      expense('e-2', 3000, 'Cine', 'c-ocio', BEA, -1),
    ],
    settlements: [],
    budgets: [],
    recurring_expenses: [],
    personal_entries: [],
    personal_recurring: [],
    personal_budgets: [],
    savings_goals: [],
    savings_contributions: [],
    events: [],
    expense_reactions: [],
    shopping_items: [
      { id: 's-1', household_id: HOME, name: 'Leche', quantity: 2, unit: null, category: 'lacteos', important: false, estimated_cents: null,
        status: 'pending', bought_at: null, bought_by: null, cleared_at: null, price_cents: null, created_by: ANA, created_at: iso(now), updated_at: iso(now) },
    ],
    pending_payments: [],
    push_subscriptions: [],
    expense_changes: [
      { id: 2, household_id: HOME, expense_id: 'e-borrado', action: 'delete', changed_by: BEA, changed_at: iso(now),
        old_row: expense('e-borrado', 1800, 'Farmacia', 'c-casa', BEA), new_row: null },
      { id: 1, household_id: HOME, expense_id: 'e-1', action: 'insert', changed_by: ANA, changed_at: iso(now), old_row: null, new_row: expense('e-1', 5420, 'Mercadona', 'c-super', ANA) },
    ],
    app_errors: [
      { id: 1, household_id: HOME, user_id: BEA, happened_at: iso(now), message: "Cannot read properties of undefined (reading 'id')",
        detail: 'TypeError: Cannot read properties of undefined\n    at ExpenseRow', place: 'gastos', app_version: '3.15.0', device: 'iPhone de Bea' },
    ],
    backups: [{ id: 1, household_id: HOME, user_id: null, taken_at: iso(now), data: { expenses: [] } }],
  };
}

export interface Fake {
  tables: Tables;
  /** Lo que la app ha pedido escribir, en orden: "POST expenses", "rpc restore_expense"… */
  writes: { what: string; body: unknown }[];
  /** true = el móvil se queda sin conexión: cada petición falla como sin red. */
  offline: boolean;
}

function fakeJwt(sub: string): string {
  const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url');
  return `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub, role: 'authenticated', exp: 4102444800, email: 'ana@example.com' })}.firma`;
}

const user = { id: ANA, aud: 'authenticated', role: 'authenticated', email: 'ana@example.com', app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' };

/** Filtros de PostgREST que usa la app: col=eq.x, col=is.null, col=in.(a,b). */
function matches(row: Row, params: URLSearchParams): boolean {
  for (const [key, value] of params) {
    if (['select', 'order', 'limit', 'offset', 'on_conflict', 'columns'].includes(key)) continue;
    const [op, ...rest] = value.split('.');
    const arg = rest.join('.');
    const cell = row[key];
    if (op === 'eq' && String(cell) !== arg) return false;
    if (op === 'neq' && String(cell) === arg) return false;
    if (op === 'is' && arg === 'null' && cell != null) return false;
    if (op === 'in' && !arg.replace(/^\(|\)$/g, '').split(',').includes(String(cell))) return false;
  }
  return true;
}

async function handleRest(route: Route, fake: Fake) {
  const req = route.request();
  const url = new URL(req.url());
  const path = url.pathname.replace('/rest/v1/', '');
  const method = req.method();
  const wantsObject = (req.headers()['accept'] ?? '').includes('vnd.pgrst.object');
  const json = (body: unknown, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });

  if (path.startsWith('rpc/')) {
    const name = path.slice(4);
    const body = req.postDataJSON() as Row | null;
    if (name === 'restore_expense') {
      fake.writes.push({ what: 'rpc restore_expense', body });
      const change = fake.tables.expense_changes.find((c) => c.id === body?.p_change_id);
      if (change?.old_row) fake.tables.expenses.push(change.old_row as Row);
      return json(change?.expense_id ?? null);
    }
    if (name === 'my_pay_key') return json(null);
    return json(name.startsWith('generate_') ? 0 : []);
  }

  const rows = (fake.tables[path] ??= []);
  if (method === 'GET' || method === 'HEAD') {
    const found = rows.filter((r) => matches(r, url.searchParams));
    if (wantsObject) return found.length === 1 ? json(found[0]) : json({ code: 'PGRST116', message: 'No rows' }, 406);
    return json(found);
  }
  const body = req.postDataJSON() as Row | Row[] | null;
  fake.writes.push({ what: `${method} ${path}`, body });
  if (method === 'POST') {
    const added = (Array.isArray(body) ? body : [body ?? {}]).map((r) => ({
      id: `nuevo-${fake.writes.length}`, household_id: HOME, user_id: ANA, created_at: iso(new Date()), updated_at: iso(new Date()), created_by: ANA, ...r,
    }));
    rows.push(...added);
    return json(wantsObject ? added[0] : added, 201);
  }
  const hit = rows.filter((r) => matches(r, url.searchParams));
  if (method === 'PATCH') hit.forEach((r) => Object.assign(r, body));
  if (method === 'DELETE') fake.tables[path] = rows.filter((r) => !hit.includes(r));
  return json(wantsObject ? hit[0] ?? null : hit);
}

/** Abre la app con la sesión de Ana ya iniciada (o sin sesión) contra el Supabase de mentira. */
export async function openApp(page: Page, { loggedIn = true, tables = sampleData() } = {}): Promise<Fake> {
  const fake: Fake = { tables, writes: [], offline: false };
  const session = {
    access_token: fakeJwt(ANA), refresh_token: 'refresco', token_type: 'bearer', expires_in: 3600 * 24 * 365,
    expires_at: 4102444800, user,
  };
  await page.addInitScript(([s, v]) => {
    try {
      localStorage.setItem('gastos.versionVista', v as string);
      if (s) localStorage.setItem('sb-example-auth-token', s as string);
    } catch {
      // Sin almacenamiento.
    }
  }, [loggedIn ? JSON.stringify(session) : null, version]);

  await page.route('https://example.supabase.co/**', async (route) => {
    if (fake.offline) return route.abort('internetdisconnected');
    const path = new URL(route.request().url()).pathname;
    if (path.startsWith('/rest/v1/')) return handleRest(route, fake);
    if (path.startsWith('/auth/v1/user')) return route.fulfill({ json: user });
    if (path.startsWith('/auth/v1/token')) return route.fulfill({ json: session });
    if (path.startsWith('/auth/v1/logout')) return route.fulfill({ status: 204, body: '' });
    if (path.startsWith('/functions/v1/')) return route.fulfill({ json: {} });
    return route.fulfill({ status: 404, body: '' });
  });
  // Tiempo real: se acepta la conexión y no se manda nada.
  await page.routeWebSocket(/example\.supabase\.co/, () => {});
  await page.goto('/');
  return fake;
}
