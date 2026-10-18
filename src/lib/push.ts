import { supabase } from './supabase';

/*
 * Avisos en el móvil (notificaciones push).
 *
 * El móvil se apunta con la clave pública que da la función "avisar" de Supabase y guarda su
 * dirección en push_subscriptions. Cuando alguien apunta gastos, la app le pide a la función
 * que avise a la pareja (y a los dos si un presupuesto llega a su aviso).
 */

const FUNCTION = 'avisar';

export interface PushPrefs {
  expenses: boolean;
  budget: boolean;
  /** Resumen de la semana (lunes) y del mes (día 1). */
  summary: boolean;
}

export type PushSupport = 'ok' | 'install-first' | 'unsupported';

const isIos = () => /iphone|ipad|ipod/i.test(navigator.userAgent);
const isStandalone = () =>
  window.matchMedia?.('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true;

/** ¿Se pueden activar los avisos aquí? En iPhone hace falta tener la app instalada. */
export function pushSupport(): PushSupport {
  const hasApi = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
  if (isIos() && !isStandalone()) return 'install-first';
  return hasApi ? 'ok' : 'unsupported';
}

async function registration(): Promise<ServiceWorkerRegistration> {
  const existing = await navigator.serviceWorker.getRegistration();
  if (existing) return existing;
  await navigator.serviceWorker.register('/sw.js');
  return navigator.serviceWorker.ready;
}

/** Suscripción de este móvil, si los avisos están activados. */
export async function currentSubscription(): Promise<PushSubscription | null> {
  if (pushSupport() !== 'ok') return null;
  const reg = await navigator.serviceWorker.getRegistration();
  return (await reg?.pushManager.getSubscription()) ?? null;
}

/** Preferencias guardadas de este móvil (o las de por defecto). */
export async function savedPrefs(endpoint: string): Promise<PushPrefs> {
  const { data } = await supabase.from('push_subscriptions').select('notify_expenses, notify_budget, notify_summary').eq('endpoint', endpoint).maybeSingle();
  return { expenses: data?.notify_expenses ?? true, budget: data?.notify_budget ?? true, summary: data?.notify_summary ?? true };
}

function base64UrlToBytes(s: string): Uint8Array<ArrayBuffer> {
  const pad = '='.repeat((4 - (s.length % 4)) % 4);
  const raw = atob((s + pad).replace(/-/g, '+').replace(/_/g, '/'));
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

/** Pide permiso, apunta este móvil y guarda qué avisos quiere. Devuelve un error legible o null. */
export async function enablePush(prefs: PushPrefs): Promise<string | null> {
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') {
    return 'El móvil no ha dado permiso para avisos. Actívalo en los ajustes del navegador o del móvil para esta app.';
  }
  const { data, error } = await supabase.functions.invoke<{ publicKey: string }>(FUNCTION, { method: 'GET' });
  if (error || !data?.publicKey) {
    return 'Los avisos aún no están preparados en el servidor (falta la función «avisar» de Supabase).';
  }
  try {
    const reg = await registration();
    let sub = await reg.pushManager.getSubscription();
    const key = base64UrlToBytes(data.publicKey);
    // Si el móvil estaba apuntado con otra clave, se vuelve a apuntar.
    const current = sub?.options.applicationServerKey;
    if (sub && current && !sameBytes(new Uint8Array(current), key)) {
      await sub.unsubscribe();
      sub = null;
    }
    sub ??= await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key });
    return await savePrefs(sub, prefs);
  } catch {
    return 'No se han podido activar los avisos en este móvil.';
  }
}

function sameBytes(a: Uint8Array, b: Uint8Array) {
  return a.length === b.length && a.every((x, i) => x === b[i]);
}

export async function savePrefs(sub: PushSubscription, prefs: PushPrefs): Promise<string | null> {
  const json = sub.toJSON();
  const { error } = await supabase.rpc('save_push_subscription', {
    p_endpoint: sub.endpoint,
    p_p256dh: json.keys?.p256dh ?? '',
    p_auth: json.keys?.auth ?? '',
    p_notify_expenses: prefs.expenses,
    p_notify_budget: prefs.budget,
    p_notify_summary: prefs.summary,
  });
  return error ? 'No se han podido guardar los avisos. Inténtalo de nuevo.' : null;
}

/** Deja de recibir avisos en este móvil. */
export async function disablePush(): Promise<void> {
  const sub = await currentSubscription();
  if (!sub) return;
  await supabase.from('push_subscriptions').delete().eq('endpoint', sub.endpoint);
  await sub.unsubscribe();
}

/** Manda un aviso de prueba a este mismo móvil. */
export async function testPush(): Promise<string | null> {
  const { error } = await supabase.functions.invoke(FUNCTION, { body: { test: true } });
  return error ? 'No se ha podido enviar el aviso de prueba.' : null;
}

/**
 * Pide avisar de gastos recién apuntados. No espera ni avisa de errores: si los avisos no
 * están preparados o no hay conexión, el gasto se guarda igual.
 */
export function notifyNewExpenses(ids: string[]) {
  if (ids.length === 0) return;
  void supabase.functions.invoke(FUNCTION, { body: { expense_ids: ids } }).catch(() => undefined);
}

/** Al cerrar sesión, este móvil deja de recibir los avisos de esa cuenta. */
export async function forgetPushOnSignOut(): Promise<void> {
  try {
    const sub = await currentSubscription();
    if (sub) await supabase.from('push_subscriptions').delete().eq('endpoint', sub.endpoint);
  } catch {
    // Sin conexión: la función dejará de avisar cuando el móvil ya no responda.
  }
}
