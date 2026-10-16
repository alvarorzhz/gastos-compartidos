// Función "avisar" de Supabase: manda los avisos al móvil (notificaciones push).
//
// - GET: devuelve la clave pública con la que los móviles se apuntan a los avisos.
// - POST { expense_ids }: la app la llama justo después de apuntar gastos. Avisa a la pareja
//   ("Ana apuntó 23,40 € · Supermercado") y, si con esos gastos una categoría llega a su aviso
//   de presupuesto, avisa a los dos.
// - POST { test: true }: manda un aviso de prueba a los móviles de quien llama.
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

    // Quién llama: solo una cuenta con sesión, y solo sobre su espacio.
    const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
    const { data: auth } = await admin.auth.getUser(token);
    const user = auth?.user;
    if (!user) return json({ error: 'Sin sesión' }, 401);

    const body = await req.json().catch(() => ({}));

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
    const categoryOf = new Map((categories ?? []).map((c) => [c.id as string, c]));
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
    const budgetSubs = subs.filter((s) => s.notify_budget);
    if (budgetSubs.length) {
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
        const next = addMonth(month);
        const { data: monthRows } = await admin
          .from('expenses')
          .select('amount_cents')
          .eq('household_id', h)
          .eq('category_id', categoryId)
          .gte('spent_on', month)
          .lt('spent_on', next);
        const after = (monthRows ?? []).reduce((t, r) => t + r.amount_cents, 0);
        const before = after - added;
        const crossed = (pct: number) => before * 100 < limit * pct && after * 100 >= limit * pct;
        const percent = Math.floor((after * 100) / limit);
        let body: string | null = null;
        if (after > limit && before <= limit) body = `Os habéis pasado del presupuesto: ${fmt(after)} de ${fmt(limit)} (${percent} %).`;
        else if (crossed(category.alert_percent)) body = `Lleváis el ${percent} % del presupuesto: ${fmt(after)} de ${fmt(limit)}.`;
        if (!body) continue;
        await send(admin, budgetSubs, { title: category.name as string, body, tag: 'presupuesto-' + key, url: '/#presupuesto' });
        sent += budgetSubs.length;
      }
    }

    return json({ sent });
  } catch (err) {
    console.error(err);
    return json({ error: 'No se han podido enviar los avisos' }, 500);
  }
});

/** "2026-10-01" → "2026-11-01" */
function addMonth(month: string): string {
  const [y, m] = month.split('-').map(Number);
  return m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, '0')}-01`;
}
