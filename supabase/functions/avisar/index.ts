// Función "avisar" de Supabase: manda los avisos al móvil (notificaciones push).
//
// - GET: devuelve la clave pública con la que los móviles se apuntan a los avisos.
// - POST { expense_ids }: la app la llama justo después de apuntar gastos. Avisa a la pareja
//   ("Ana apuntó 23,40 € · Supermercado") y, si con esos gastos una categoría llega a su aviso
//   de presupuesto, avisa a los dos.
// - POST { test: true }: manda un aviso de prueba a los móviles de quien llama.
// - POST { reaction_expense_id }: la app la llama al reaccionar a un gasto. Avisa a la pareja
//   ("Ana: ❤️ a Cena japonés").
// - POST { daily: true, secret }: la llama el servidor cada mañana (ver 0010_automatico.sql).
//   Avisa de los gastos fijos que se han apuntado solos, el lunes manda el resumen de la
//   semana y el día 1 el del mes (con el saldo entre los dos).
// - POST ?pago=CLAVE { importe, tienda, tarjeta }: la llama el atajo del iPhone al pagar con
//   Apple Pay (ver 0012_pagos_apple_pay.sql). Guarda el pago por confirmar y avisa a quien pagó
//   («Toca para apuntarlo»); al tocar el aviso se abre la app con el gasto relleno.
//
// Las claves para firmar los avisos se crean solas la primera vez y se guardan en push_keys.
// No hace falta configurar nada: usa las variables que Supabase ya pone a cada función.

import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2';
import * as webpush from 'jsr:@negrel/webpush@0.5.0';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

const euros = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' });
const fmt = (cents: number) => euros.format(Math.round(cents) / 100);

/** Solo se avisa de gastos recién apuntados (la app llama justo después de guardarlos). */
const FRESH_MS = 15 * 60 * 1000;

interface Sub {
  endpoint: string;
  user_id: string;
  p256dh: string;
  auth: string;
  notify_expenses: boolean;
  notify_budget: boolean;
  notify_summary?: boolean;
}

interface Message {
  title: string;
  body: string;
  tag: string;
  url: string;
}

let server: webpush.ApplicationServer | null = null;
let publicKey = '';

/** Claves de los avisos: las lee de push_keys o las crea la primera vez. */
async function vapidKeys(admin: SupabaseClient): Promise<CryptoKeyPair> {
  const { data } = await admin.from('push_keys').select('vapid').eq('id', 1).maybeSingle();
  if (data?.vapid) return await webpush.importVapidKeys(data.vapid, { extractable: false });
  const fresh = await webpush.generateVapidKeys({ extractable: true });
  const exported = await webpush.exportVapidKeys(fresh);
  // Si dos llamadas las crean a la vez, se queda la primera y se vuelve a leer.
  await admin.from('push_keys').upsert({ id: 1, vapid: exported }, { onConflict: 'id', ignoreDuplicates: true });
  const { data: saved, error } = await admin.from('push_keys').select('vapid').eq('id', 1).single();
  if (error || !saved) throw new Error('No se han podido guardar las claves de los avisos');
  return await webpush.importVapidKeys(saved.vapid, { extractable: false });
}

async function appServer(admin: SupabaseClient) {
  if (!server) {
    const keys = await vapidKeys(admin);
    publicKey = await webpush.exportApplicationServerKey(keys);
    server = await webpush.ApplicationServer.new({
      contactInformation: Deno.env.get('PUSH_CONTACT') ?? 'mailto:avisos@gastos-compartidos.app',
      vapidKeys: keys,
    });
  }
  return server;
}

/** Manda un aviso a cada móvil; los que ya no existen se borran. */
async function send(admin: SupabaseClient, subs: Sub[], message: Message) {
  const as = await appServer(admin);
  await Promise.all(
    subs.map(async (s) => {
      try {
        await as.subscribe({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } })
          .pushTextMessage(JSON.stringify(message), { ttl: 24 * 3600, urgency: webpush.Urgency.Normal });
      } catch (err) {
        const status = err instanceof webpush.PushMessageError ? err.response.status : 0;
        if (status === 404 || status === 410) await admin.from('push_subscriptions').delete().eq('endpoint', s.endpoint);
        else console.error('Aviso no enviado', status, String(err));
      }
    }),
  );
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false },
  });

  try {
    if (req.method === 'GET') {
      await appServer(admin);
      return json({ publicKey });
    }
    if (req.method !== 'POST') return json({ error: 'Método no permitido' }, 405);

    // JSON normalmente; el atajo del iPhone también puede mandar un formulario.
    const raw = await req.text().catch(() => '');
    // deno-lint-ignore no-explicit-any
    let body: any = {};
    try {
      body = (raw ? JSON.parse(raw) : null) ?? {};
    } catch {
      body = Object.fromEntries(new URLSearchParams(raw));
    }

    // El trabajo de cada mañana: se presenta con la clave de la tabla automation.
    if (body?.daily) {
      const { data: auto } = await admin.from('automation').select('secret').eq('id', 1).maybeSingle();
      if (!auto?.secret || typeof body.secret !== 'string' || body.secret !== auto.secret) return json({ error: 'No autorizado' }, 401);
      const sent = await daily(admin, madridDate(new Date()));
      await admin.from('automation').update({ last_notified_at: new Date().toISOString() }).eq('id', 1);
      return json({ sent });
    }

    // Un pago con Apple Pay desde el atajo del iPhone: se presenta con la clave de quien paga.
    const payKey = new URL(req.url).searchParams.get('pago') ?? (typeof body?.clave === 'string' ? body.clave : null);
    if (payKey) return await receivePayment(admin, payKey, body);

    // Quién llama: solo una cuenta con sesión, y solo sobre su espacio.
    const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
    const { data: auth } = await admin.auth.getUser(token);
    const user = auth?.user;
    if (!user) return json({ error: 'Sin sesión' }, 401);

    if (body?.test) {
      const { data: subs } = await admin.from('push_subscriptions').select('*').eq('user_id', user.id);
      await send(admin, (subs ?? []) as Sub[], {
        title: 'Los avisos funcionan',
        body: 'Así te avisará la app de los gastos de tu pareja y de los presupuestos.',
        tag: 'prueba',
        url: '/#ajustes',
      });
      return json({ sent: subs?.length ?? 0 });
    }

    if (typeof body?.reaction_expense_id === 'string') return json({ sent: await reactionNotice(admin, user.id, body.reaction_expense_id) });

    const ids: string[] = Array.isArray(body?.expense_ids) ? body.expense_ids.filter((x: unknown) => typeof x === 'string').slice(0, 500) : [];
    if (ids.length === 0) return json({ sent: 0 });

    const { data: member } = await admin.from('members').select('household_id, display_name').eq('user_id', user.id).maybeSingle();
    if (!member) return json({ sent: 0 });
    const h = member.household_id as string;

    // Gastos recién apuntados por quien llama, en su espacio.
    const since = new Date(Date.now() - FRESH_MS).toISOString();
    const { data: found } = await admin
      .from('expenses')
      .select('id, amount_cents, spent_on, category_id, note, recurring_id')
      .in('id', ids)
      .eq('household_id', h)
      .eq('created_by', user.id)
      .gte('created_at', since);
    if (!found?.length) return json({ sent: 0 });

    // Cada gasto se avisa una sola vez, aunque la app llame dos veces.
    const { data: fresh } = await admin
      .from('push_sent')
      .upsert(found.map((e) => ({ expense_id: e.id })), { onConflict: 'expense_id', ignoreDuplicates: true })
      .select('expense_id');
    const newIds = new Set((fresh ?? []).map((x) => x.expense_id as string));
    const expenses = found.filter((e) => newIds.has(e.id));
    if (expenses.length === 0) return json({ sent: 0 });

    const [{ data: members }, { data: categories }] = await Promise.all([
      admin.from('members').select('user_id').eq('household_id', h),
      admin.from('categories').select('id, name, alert_percent').eq('household_id', h),
    ]);
    const memberIds = (members ?? []).map((m) => m.user_id as string);
    const { data: subsData } = await admin.from('push_subscriptions').select('*').in('user_id', memberIds);
    const subs = (subsData ?? []) as Sub[];
    const categoryOf = new Map<string, CategoryInfo>((categories ?? []).map((c) => [c.id as string, c as CategoryInfo]));
    let sent = 0;

    // 1. A la pareja: qué se ha apuntado.
    const partnerSubs = subs.filter((s) => s.user_id !== user.id && s.notify_expenses);
    if (partnerSubs.length) {
      const name = member.display_name as string;
      const total = expenses.reduce((t, e) => t + e.amount_cents, 0);
      const message: Message =
        expenses.length === 1
          ? {
            title: `${name} apuntó ${fmt(total)}`,
            body: [expenses[0].note, categoryOf.get(expenses[0].category_id)?.name].filter(Boolean).join(' · '),
            tag: 'gasto-' + expenses[0].id,
            url: '/#gastos',
          }
          : { title: `${name} apuntó ${expenses.length} gastos`, body: `En total, ${fmt(total)}`, tag: 'gastos-' + expenses[0].id, url: '/#gastos' };
      await send(admin, partnerSubs, message);
      sent += partnerSubs.length;
    }

    // 2. A los dos: presupuestos que, con estos gastos, han llegado a su aviso o al límite.
    sent += await budgetAlerts(admin, h, expenses, categoryOf, subs.filter((s) => s.notify_budget));

    return json({ sent });
  } catch (err) {
    console.error(err);
    return json({ error: 'No se han podido enviar los avisos' }, 500);
  }
});

/** Avisa a la pareja de tu reacción a un gasto: "Ana: ❤️ «¡Repetimos!»" sobre "Cena japonés · 38,50 €". */
async function reactionNotice(admin: SupabaseClient, userId: string, expenseId: string): Promise<number> {
  const { data: r } = await admin.from('expense_reactions').select('emoji, comment, household_id, updated_at').eq('expense_id', expenseId).eq('user_id', userId).maybeSingle();
  // Solo reacciones recién guardadas (la app llama justo después).
  if (!r || Date.now() - new Date(r.updated_at as string).getTime() > FRESH_MS) return 0;
  const h = r.household_id as string;
  const [{ data: members }, { data: expense }] = await Promise.all([
    admin.from('members').select('user_id, display_name').eq('household_id', h),
    admin.from('expenses').select('amount_cents, note, category_id').eq('id', expenseId).eq('household_id', h).maybeSingle(),
  ]);
  const me = (members ?? []).find((m) => m.user_id === userId);
  const partner = (members ?? []).find((m) => m.user_id !== userId);
  if (!me || !partner || !expense) return 0;
  const { data: subs } = await admin.from('push_subscriptions').select('*').eq('user_id', partner.user_id).eq('notify_expenses', true);
  if (!subs?.length) return 0;
  let title = expense.note as string | null;
  if (!title) {
    const { data: c } = await admin.from('categories').select('name').eq('id', expense.category_id).maybeSingle();
    title = (c?.name as string) ?? 'un gasto';
  }
  await send(admin, subs as Sub[], {
    title: `${me.display_name}: ${[r.emoji, r.comment ? `«${r.comment}»` : null].filter(Boolean).join(' ')}`,
    body: `En ${title} · ${fmt(expense.amount_cents as number)}`,
    tag: 'reaccion-' + expenseId,
    url: '/#gastos',
  });
  return subs.length;
}

/** Texto de un campo del atajo (el iPhone puede mandar número, texto o nada). */
const field = (v: unknown) => (typeof v === 'string' ? v : typeof v === 'number' ? String(v) : '');

/** Guarda el pago que manda el atajo y avisa a quien pagó para que lo confirme. */
async function receivePayment(admin: SupabaseClient, key: string, body: Record<string, unknown>) {
  const { data, error } = await admin.rpc('receive_payment', {
    p_key: key,
    p_amount: field(body.importe ?? body.amount),
    p_merchant: field(body.tienda ?? body.merchant),
    p_card: field(body.tarjeta ?? body.card),
  });
  if (error) throw error;
  const result = data as { status: string; id?: string; user_id?: string; amount_cents?: number | null; merchant?: string | null };
  if (result.status === 'bad-key') return json({ error: 'Clave no válida. Copia de nuevo la dirección desde Ajustes de la app.' }, 401);
  if (result.status !== 'ok') return json({ ok: true, mensaje: 'Este pago ya había llegado' });

  const { data: subs } = await admin.from('push_subscriptions').select('*').eq('user_id', result.user_id);
  const what = result.amount_cents != null ? fmt(result.amount_cents) : 'un pago';
  await send(admin, (subs ?? []) as Sub[], {
    title: result.merchant ? `Pago de ${what} en ${result.merchant}` : `Pago de ${what} con Apple Pay`,
    body: 'Toca para apuntarlo como gasto común o personal.',
    tag: 'pago-' + result.id,
    url: `/?pago=${result.id}#inicio`,
  });
  return json({ ok: true, mensaje: 'Pago recibido: confírmalo en la app' });
}

/** "2026-10-01" → "2026-11-01" */
function addMonth(month: string): string {
  const [y, m] = month.split('-').map(Number);
  return m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, '0')}-01`;
}

interface NewExpense {
  id: string;
  amount_cents: number;
  spent_on: string;
  category_id: string;
  note: string | null;
}

type CategoryInfo = { name: string; alert_percent: number | null; archived?: boolean };

/** Avisa a `subs` de los presupuestos que, con estos gastos, han llegado a su aviso o al límite. */
async function budgetAlerts(admin: SupabaseClient, h: string, expenses: NewExpense[], categoryOf: Map<string, CategoryInfo>, subs: Sub[]) {
  if (subs.length === 0) return 0;
  let sent = 0;
  const groups = new Map<string, number>(); // "mes|categoría" → lo recién apuntado
  for (const e of expenses) {
    const key = e.spent_on.slice(0, 7) + '-01|' + e.category_id;
    groups.set(key, (groups.get(key) ?? 0) + e.amount_cents);
  }
  for (const [key, added] of groups) {
    const [month, categoryId] = key.split('|');
    const category = categoryOf.get(categoryId);
    if (!category || category.alert_percent == null) continue;
    const { data: budget } = await admin
      .from('budgets')
      .select('amount_cents')
      .eq('household_id', h)
      .eq('category_id', categoryId)
      .lte('month', month)
      .order('month', { ascending: false })
      .limit(1)
      .maybeSingle();
    const limit = budget?.amount_cents ?? 0;
    if (limit <= 0) continue;
    const monthRows = await allRows<{ amount_cents: number }>((from, to) =>
      admin.from('expenses').select('amount_cents').eq('household_id', h).eq('category_id', categoryId)
        .gte('spent_on', month).lt('spent_on', addMonth(month)).order('id').range(from, to));
    const after = monthRows.reduce((t, r) => t + r.amount_cents, 0);
    const before = after - added;
    const crossed = (pct: number) => before * 100 < limit * pct && after * 100 >= limit * pct;
    const percent = Math.floor((after * 100) / limit);
    let body: string | null = null;
    if (after > limit && before <= limit) body = `Os habéis pasado del presupuesto: ${fmt(after)} de ${fmt(limit)} (${percent} %).`;
    else if (crossed(category.alert_percent)) body = `Lleváis el ${percent} % del presupuesto: ${fmt(after)} de ${fmt(limit)}.`;
    if (!body) continue;
    await send(admin, subs, { title: category.name, body, tag: 'presupuesto-' + key, url: '/#presupuesto' });
    sent += subs.length;
  }
  return sent;
}

/** Todas las filas de una consulta, de mil en mil (Supabase devuelve como mucho mil de una vez). */
async function allRows<T>(page: (from: number, to: number) => PromiseLike<{ data: unknown[] | null; error: unknown }>): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await page(from, from + 999);
    if (error) throw error;
    out.push(...((data ?? []) as T[]));
    if (!data || data.length < 1000) return out;
  }
}

/** Fecha de hoy en España, "YYYY-MM-DD". */
function madridDate(d: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid' }).format(d);
}

function addDaysIso(iso: string, days: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

const monthName = (month: string) => {
  const [y, m] = month.split('-').map(Number);
  const s = new Date(Date.UTC(y, m - 1, 15)).toLocaleDateString('es-ES', { month: 'long', timeZone: 'UTC' });
  return s.charAt(0).toUpperCase() + s.slice(1);
};

/** Lista "a, b y c". */
const joinList = (items: string[]) => (items.length <= 1 ? items.join('') : items.slice(0, -1).join(', ') + ' y ' + items[items.length - 1]);

/** ¿Se manda este resumen? Solo una vez por espacio y periodo, aunque el trabajo se repita. */
async function firstTime(admin: SupabaseClient, h: string, kind: 'week' | 'month', period: string) {
  const { data } = await admin
    .from('push_digests')
    .upsert({ household_id: h, kind, period }, { onConflict: 'household_id,kind,period', ignoreDuplicates: true })
    .select('period');
  return (data ?? []).length > 0;
}

/** El trabajo de cada mañana para todos los espacios. */
async function daily(admin: SupabaseClient, today: string) {
  const { data: households } = await admin.from('households').select('id');
  let sent = 0;
  for (const { id: h } of households ?? []) {
    try {
      sent += await dailyFor(admin, h as string, today);
    } catch (err) {
      console.error('Trabajo diario', h, String(err));
    }
  }
  return sent;
}

async function dailyFor(admin: SupabaseClient, h: string, today: string) {
  const [{ data: members }, { data: categories }] = await Promise.all([
    admin.from('members').select('user_id, display_name').eq('household_id', h),
    admin.from('categories').select('id, name, alert_percent, archived').eq('household_id', h),
  ]);
  const memberList = (members ?? []) as { user_id: string; display_name: string }[];
  if (memberList.length === 0) return 0;
  const { data: subsData } = await admin.from('push_subscriptions').select('*').in('user_id', memberList.map((m) => m.user_id));
  const subs = (subsData ?? []) as Sub[];
  if (subs.length === 0) return 0;
  const categoryOf = new Map<string, CategoryInfo>((categories ?? []).map((c) => [c.id as string, c as CategoryInfo]));
  const categoryName = (id: string) => categoryOf.get(id)?.name ?? 'Otros';
  let sent = 0;

  // 1. Gastos fijos que se han apuntado solos (hoy o al abrir la app): a los dos.
  const since = new Date(Date.now() - 36 * 3600 * 1000).toISOString();
  const { data: fixed } = await admin
    .from('expenses')
    .select('id, amount_cents, spent_on, category_id, note')
    .eq('household_id', h)
    .not('recurring_id', 'is', null)
    .gte('created_at', since)
    .order('spent_on')
    .limit(200);
  if (fixed?.length) {
    const { data: fresh } = await admin
      .from('push_sent')
      .upsert(fixed.map((e) => ({ expense_id: e.id })), { onConflict: 'expense_id', ignoreDuplicates: true })
      .select('expense_id');
    const newIds = new Set((fresh ?? []).map((x) => x.expense_id as string));
    const expenses = (fixed as NewExpense[]).filter((e) => newIds.has(e.id));
    const expenseSubs = subs.filter((s) => s.notify_expenses);
    if (expenses.length && expenseSubs.length) {
      const total = expenses.reduce((t, e) => t + e.amount_cents, 0);
      const names = expenses.map((e) => e.note || categoryName(e.category_id));
      await send(admin, expenseSubs, expenses.length === 1
        ? { title: `Apuntado solo: ${fmt(total)}`, body: `${names[0]} (gasto fijo)`, tag: 'fijo-' + expenses[0].id, url: '/#gastos' }
        : { title: `${expenses.length} gastos fijos apuntados: ${fmt(total)}`, body: joinList(names.slice(0, 4)) + (names.length > 4 ? '…' : ''), tag: 'fijos-' + today, url: '/#gastos' });
      sent += expenseSubs.length;
    }
    if (expenses.length) sent += await budgetAlerts(admin, h, expenses, categoryOf, subs.filter((s) => s.notify_budget));
  }

  const summarySubs = subs.filter((s) => s.notify_summary !== false);
  if (summarySubs.length === 0) return sent;
  const [y, m, d] = today.split('-').map(Number);
  const weekday = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 1 = lunes

  // Presupuesto vigente de un mes: el último puesto en ese mes o antes, por categoría.
  const budgets = await allRows<{ category_id: string; month: string; amount_cents: number }>((from, to) =>
    admin.from('budgets').select('category_id, month, amount_cents').eq('household_id', h).order('month').range(from, to));
  const limitsFor = (month: string) => {
    const limits = new Map<string, number>();
    for (const b of budgets) if (b.month <= month && !categoryOf.get(b.category_id)?.archived) limits.set(b.category_id, b.amount_cents);
    return limits;
  };
  const spentIn = async (fromIso: string, toExclusive: string) =>
    await allRows<{ amount_cents: number; category_id: string }>((from, to) =>
      admin.from('expenses').select('amount_cents, category_id').eq('household_id', h)
        .gte('spent_on', fromIso).lt('spent_on', toExclusive).order('id').range(from, to));
  /** Lo gastado en las categorías con presupuesto frente al presupuesto. */
  const versusBudget = (rows: { amount_cents: number; category_id: string }[], limits: Map<string, number>) => {
    let budget = 0;
    for (const v of limits.values()) budget += v;
    const spent = rows.filter((r) => (limits.get(r.category_id) ?? 0) > 0).reduce((t, r) => t + r.amount_cents, 0);
    return { budget, spent };
  };

  // 2. Los lunes: la semana pasada (de lunes a domingo).
  if (weekday === 1) {
    const start = addDaysIso(today, -7);
    const rows = await spentIn(start, today);
    if (rows.length > 0 && (await firstTime(admin, h, 'week', start))) {
      const total = rows.reduce((t, r) => t + r.amount_cents, 0);
      const byCategory = new Map<string, number>();
      for (const r of rows) byCategory.set(r.category_id, (byCategory.get(r.category_id) ?? 0) + r.amount_cents);
      const [topId, topCents] = [...byCategory.entries()].sort((a, b) => b[1] - a[1])[0];
      const parts = [`Lo que más: ${categoryName(topId)} (${fmt(topCents)}).`];
      const month = today.slice(0, 7) + '-01';
      const { budget, spent } = versusBudget(await spentIn(month, addMonth(month)), limitsFor(month));
      if (budget > 0) parts.push(`Este mes lleváis ${fmt(spent)} de ${fmt(budget)} de presupuesto.`);
      await send(admin, summarySubs, { title: `La semana pasada: ${fmt(total)} en común`, body: parts.join(' '), tag: 'semana-' + start, url: '/' });
      sent += summarySubs.length;
    }
  }

  // 3. El día 1: cómo fue el mes pasado y cómo queda el saldo.
  if (d === 1) {
    const month = addDaysIso(today, -1).slice(0, 7) + '-01';
    const rows = await spentIn(month, addMonth(month));
    if (rows.length > 0 && (await firstTime(admin, h, 'month', month))) {
      const total = rows.reduce((t, r) => t + r.amount_cents, 0);
      const parts: string[] = [];
      const { budget, spent } = versusBudget(rows, limitsFor(month));
      if (budget > 0) parts.push(spent <= budget ? `Os sobraron ${fmt(budget - spent)} del presupuesto.` : `Os pasasteis ${fmt(spent - budget)} del presupuesto.`);
      if (memberList.length === 2) parts.push(await balanceText(admin, h, memberList));
      await send(admin, summarySubs, { title: `${monthName(month)}: ${fmt(total)} en común`, body: parts.join(' '), tag: 'mes-' + month, url: '/#presupuesto' });
      sent += summarySubs.length;
    }
  }
  return sent;
}

/** "Para quedar en paz, Ana le pasa 34,20 € a Alvaro" o "Estáis en paz", igual que el saldo de la app. */
async function balanceText(admin: SupabaseClient, h: string, members: { user_id: string; display_name: string }[]) {
  const [a, b] = members;
  const expenses = await allRows<{ amount_cents: number; owed_cents: number | null; paid_by: string }>((from, to) =>
    admin.from('expenses').select('amount_cents, owed_cents, paid_by').eq('household_id', h).order('id').range(from, to));
  const settlements = await allRows<{ amount_cents: number; from_user: string; to_user: string }>((from, to) =>
    admin.from('settlements').select('amount_cents, from_user, to_user').eq('household_id', h).order('id').range(from, to));
  let owedToA = 0; // lo que b le debe a a
  for (const e of expenses) {
    const owed = e.owed_cents ?? e.amount_cents / 2;
    owedToA += e.paid_by === a.user_id ? owed : -owed;
  }
  for (const s of settlements) {
    if (s.from_user === a.user_id) owedToA += s.amount_cents;
    else if (s.to_user === a.user_id) owedToA -= s.amount_cents;
  }
  const cents = Math.round(Math.abs(owedToA));
  if (cents === 0) return 'Estáis en paz.';
  return owedToA > 0
    ? `Para quedar en paz, ${b.display_name} le pasa ${fmt(cents)} a ${a.display_name}.`
    : `Para quedar en paz, ${a.display_name} le pasa ${fmt(cents)} a ${b.display_name}.`;
}
