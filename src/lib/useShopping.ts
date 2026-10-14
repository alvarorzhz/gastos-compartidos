import { useCallback, useEffect, useRef, useState } from 'react';
import { errorMessage, supabase } from './supabase';
import type { ShopCategory, ShoppingItem, ShopUnit } from './shopping';

/*
 * Lista de la compra compartida.
 *
 * - Se carga una vez al entrar en la app y se mantiene al cambiar de sección.
 * - Los cambios se ven al momento en este móvil (sin esperar a la red) y se guardan detrás.
 * - Los de la pareja llegan en tiempo real fila a fila, sin recargar todo.
 * - Cada producto nuevo lleva su id desde el móvil: si se reintenta un guardado que en realidad
 *   sí llegó, no se duplica.
 * - Marcar, deshacer y editar solo se aplican si el producto sigue como se vio, para no pisar
 *   en silencio lo que acaba de hacer la otra persona.
 */

const PAGE = 1000;
const OUTBOX_KEY = 'gastos.compra.pendientesDeGuardar';

export interface NewItem {
  name: string;
  quantity: number;
  unit: ShopUnit | null;
  category: ShopCategory;
  important?: boolean;
}

export type ItemChanges = Partial<Pick<ShoppingItem, 'name' | 'quantity' | 'unit' | 'category' | 'important' | 'estimated_cents'>>;

/** Producto en pantalla: unsaved = apuntado aquí pero aún sin guardar (failed = el guardado falló). */
export type ListItem = ShoppingItem & { unsaved?: 'saving' | 'failed' };

export type ShoppingLoad =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready' };

/** Estado de la conexión para el indicador discreto de la pantalla. */
export type SyncState = 'live' | 'saving' | 'offline';

export type Result = { ok: true } | { ok: false; reason: 'conflict' | 'error'; message: string };

export interface Draft {
  text: string;
  quantity: string;
  unit: ShopUnit | null;
  /** null = la que la app adivine por el nombre. */
  category: ShopCategory | null;
  important: boolean;
  details: boolean;
}

export const emptyDraft = (keepDetails = false): Draft => ({ text: '', quantity: '1', unit: null, category: null, important: false, details: keepDetails });

const newer = (a: string, b: string) => Date.parse(a) >= Date.parse(b);

function readOutbox(householdId: string): ListItem[] {
  try {
    const all = JSON.parse(localStorage.getItem(OUTBOX_KEY) ?? '[]') as ListItem[];
    return Array.isArray(all) ? all.filter((i) => i.household_id === householdId).map((i) => ({ ...i, unsaved: 'failed' as const })) : [];
  } catch {
    return [];
  }
}

function writeOutbox(items: ListItem[]) {
  try {
    const failed = items.filter((i) => i.unsaved === 'failed');
    if (failed.length) localStorage.setItem(OUTBOX_KEY, JSON.stringify(failed));
    else localStorage.removeItem(OUTBOX_KEY);
  } catch {
    // Sin almacenamiento (modo privado): el producto sigue en pantalla con su botón de reintentar.
  }
}

export function useShopping(householdId: string | null) {
  const [items, setItems] = useState<ListItem[]>([]);
  const [load, setLoad] = useState<ShoppingLoad>({ status: 'loading' });
  const [stale, setStale] = useState(false);
  const [live, setLive] = useState(false);
  const [inFlight, setInFlight] = useState(0);
  const [draft, setDraft] = useState<Draft>(() => emptyDraft());

  const itemsRef = useRef<ListItem[]>([]);
  itemsRef.current = items;
  /** Productos con un cambio en marcha: lo que llegue de la red para ellos se ignora hasta que acabe. */
  const busy = useRef(new Map<string, number>());
  /** Cola por producto: los cambios de un mismo producto se guardan de uno en uno y en orden. */
  const chains = useRef(new Map<string, Promise<unknown>>());

  const update = useCallback((fn: (prev: ListItem[]) => ListItem[]) => {
    setItems((prev) => {
      const next = fn(prev);
      writeOutbox(next);
      return next;
    });
  }, []);

  const setRow = useCallback((row: ListItem) => {
    update((prev) => (prev.some((i) => i.id === row.id) ? prev.map((i) => (i.id === row.id ? row : i)) : [...prev, row]));
  }, [update]);

  const refresh = useCallback(async () => {
    if (!householdId) return;
    const rows: ShoppingItem[] = [];
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await supabase
        .from('shopping_items')
        .select('*')
        .eq('household_id', householdId)
        .order('created_at')
        .order('id')
        .range(from, from + PAGE - 1);
      if (error) {
        setStale(true);
        setLoad((prev) => (prev.status === 'ready' ? prev : { status: 'error', message: errorMessage(error) }));
        return;
      }
      rows.push(...((data ?? []) as ShoppingItem[]));
      if (!data || data.length < PAGE) break;
    }
    const server = rows.map((r) => ({ ...r, quantity: Number(r.quantity) }));
    update((prev) => {
      const ids = new Set(server.map((r) => r.id));
      // Lo que se está guardando ahora mismo se queda como está en pantalla.
      const merged = server.map((r) => (busy.current.has(r.id) ? prev.find((p) => p.id === r.id) ?? r : r));
      const local = prev.filter((p) => p.unsaved && !ids.has(p.id));
      const outbox = readOutbox(householdId).filter((o) => !ids.has(o.id) && !local.some((l) => l.id === o.id));
      return [...merged, ...local, ...outbox];
    });
    setStale(false);
    setLoad({ status: 'ready' });
  }, [householdId, update]);

  /** Ejecuta un guardado en la cola del producto, marcándolo como ocupado mientras dura. */
  const enqueue = useCallback(<T,>(id: string, job: () => Promise<T>): Promise<T> => {
    busy.current.set(id, (busy.current.get(id) ?? 0) + 1);
    setInFlight((n) => n + 1);
    const prev = chains.current.get(id) ?? Promise.resolve();
    const run = prev.catch(() => undefined).then(job).finally(() => {
      const n = (busy.current.get(id) ?? 1) - 1;
      if (n <= 0) busy.current.delete(id);
      else busy.current.set(id, n);
      if (chains.current.get(id) === run) chains.current.delete(id);
      setInFlight((x) => x - 1);
    });
    chains.current.set(id, run);
    return run;
  }, []);

  const saveNew = useCallback(async (row: ListItem): Promise<Result> => {
    setRow({ ...row, unsaved: 'saving' });
    return enqueue(row.id, async () => {
      const { unsaved: _u, bought_at: _b, bought_by: _bb, cleared_at: _c, created_at: _ca, updated_at: _ua, created_by: _cb, ...fields } = row;
      let { data, error } = await supabase.from('shopping_items').insert(fields).select().single();
      // Ya se había guardado (se cortó la respuesta): se recoge tal cual, sin duplicar.
      if (error && (error as { code?: string }).code === '23505') {
        ({ data, error } = await supabase.from('shopping_items').select('*').eq('id', row.id).single());
      }
      if (error || !data) {
        setRow({ ...row, unsaved: 'failed' });
        return { ok: false, reason: 'error', message: errorMessage(error) } as Result;
      }
      setRow({ ...(data as ShoppingItem), quantity: Number(data.quantity) });
      return { ok: true } as Result;
    });
  }, [enqueue, setRow]);

  const add = useCallback((input: NewItem, userId: string): Promise<Result> => {
    if (!householdId) return Promise.resolve({ ok: false, reason: 'error', message: 'Sin espacio' });
    const now = new Date().toISOString();
    return saveNew({
      id: crypto.randomUUID(),
      household_id: householdId,
      name: input.name.trim(),
      quantity: input.quantity,
      unit: input.unit,
      category: input.category,
      important: input.important ?? false,
      estimated_cents: null,
      status: 'pending',
      bought_at: null,
      bought_by: null,
      cleared_at: null,
      created_by: userId,
      created_at: now,
      updated_at: now,
    });
  }, [householdId, saveNew]);

  /** Vuelve a intentar guardar un producto nuevo que falló (con el mismo id: no se duplica). */
  const retry = useCallback((id: string) => {
    const row = itemsRef.current.find((i) => i.id === id && i.unsaved === 'failed');
    return row ? saveNew(row) : Promise.resolve({ ok: true } as Result);
  }, [saveNew]);

  /** Quita de la pantalla un producto que nunca llegó a guardarse. */
  const discard = useCallback((id: string) => {
    update((prev) => prev.filter((i) => !(i.id === id && i.unsaved)));
  }, [update]);

  /**
   * Marca como comprado (o lo devuelve a pendientes). Se ve al momento; si la otra persona ya
   * lo había cambiado, no se pisa: se muestra lo que hay.
   */
  const setBought = useCallback((item: ListItem, bought: boolean, userId: string): Promise<Result> => {
    const from = bought ? 'pending' : 'bought';
    const before = itemsRef.current.find((i) => i.id === item.id) ?? item;
    setRow(bought
      ? { ...before, status: 'bought', bought_at: new Date().toISOString(), bought_by: userId, cleared_at: null }
      : { ...before, status: 'pending', bought_at: null, bought_by: null, cleared_at: null });
    return enqueue(item.id, async () => {
      const { data, error } = await supabase
        .from('shopping_items')
        .update({ status: bought ? 'bought' : 'pending' })
        .eq('id', item.id)
        .eq('status', from)
        .select();
      if (error) {
        setRow(before);
        return { ok: false, reason: 'error', message: errorMessage(error) } as Result;
      }
      if (!data || data.length === 0) {
        // Lo cambió (o lo quitó) la otra persona: se trae lo que hay de verdad.
        busy.current.delete(item.id);
        await refresh();
        return { ok: false, reason: 'conflict', message: 'Tu pareja acaba de cambiar este producto.' } as Result;
      }
      setRow({ ...(data[0] as ShoppingItem), quantity: Number(data[0].quantity) });
      return { ok: true } as Result;
    });
  }, [enqueue, refresh, setRow]);

  /** Guarda cambios de nombre, cantidad, unidad… solo si nadie lo ha cambiado mientras tanto. */
  const edit = useCallback((item: ListItem, changes: ItemChanges): Promise<Result> => {
    return enqueue(item.id, async () => {
      const { data, error } = await supabase
        .from('shopping_items')
        .update(changes)
        .eq('id', item.id)
        .eq('updated_at', item.updated_at)
        .select();
      if (error) return { ok: false, reason: 'error', message: errorMessage(error) } as Result;
      if (!data || data.length === 0) {
        busy.current.delete(item.id);
        await refresh();
        return { ok: false, reason: 'conflict', message: 'Tu pareja ha cambiado este producto mientras lo editabas. Revisa cómo ha quedado.' } as Result;
      }
      setRow({ ...(data[0] as ShoppingItem), quantity: Number(data[0].quantity) });
      return { ok: true } as Result;
    });
  }, [enqueue, refresh, setRow]);

  /** Termina la compra: lo comprado pasa al historial. No se borra nada. */
  const finishTrip = useCallback(async (): Promise<Result> => {
    if (!householdId) return { ok: false, reason: 'error', message: 'Sin espacio' };
    const now = new Date().toISOString();
    const before = itemsRef.current;
    const ids = before.filter((i) => i.status === 'bought' && !i.cleared_at && !i.unsaved).map((i) => i.id);
    if (ids.length === 0) return { ok: true };
    update((prev) => prev.map((i) => (ids.includes(i.id) ? { ...i, cleared_at: now } : i)));
    setInFlight((n) => n + 1);
    try {
      const { error } = await supabase
        .from('shopping_items')
        .update({ cleared_at: now })
        .eq('household_id', householdId)
        .eq('status', 'bought')
        .is('cleared_at', null)
        .in('id', ids);
      if (error) {
        update((prev) => prev.map((i) => (ids.includes(i.id) ? { ...i, cleared_at: null } : i)));
        return { ok: false, reason: 'error', message: errorMessage(error) };
      }
      await refresh();
      return { ok: true };
    } finally {
      setInFlight((n) => n - 1);
    }
  }, [householdId, refresh, update]);

  useEffect(() => {
    if (!householdId) return;
    void refresh();
    const onVisible = () => {
      if (document.visibilityState === 'visible') void refresh();
    };
    // Al volver la conexión: se ponen al día los datos y se reintenta lo que no se guardó.
    const onOnline = () => {
      void refresh().then(() => {
        for (const i of itemsRef.current) if (i.unsaved === 'failed') void saveNew(i);
      });
    };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('online', onOnline);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('online', onOnline);
    };
  }, [householdId, refresh, saveNew]);

  // Tiempo real: cada cambio de la otra persona se aplica a su fila, sin recargar la lista entera.
  useEffect(() => {
    if (!householdId) return;
    const apply = (row: ShoppingItem) => {
      if (busy.current.has(row.id)) return;
      update((prev) => {
        const current = prev.find((i) => i.id === row.id);
        // Un aviso atrasado no devuelve un producto a como estaba antes.
        if (current && !current.unsaved && !newer(row.updated_at, current.updated_at)) return prev;
        const fresh = { ...row, quantity: Number(row.quantity) };
        return current ? prev.map((i) => (i.id === row.id ? fresh : i)) : [...prev, fresh];
      });
    };
    let connectedBefore = false;
    const channel = supabase
      .channel(`compra-${householdId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'shopping_items', filter: `household_id=eq.${householdId}` }, (p) => apply(p.new as ShoppingItem))
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'shopping_items', filter: `household_id=eq.${householdId}` }, (p) => apply(p.new as ShoppingItem))
      // Los borrados solo traen el id: se quita si lo tenemos.
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'shopping_items' }, (p) => {
        const id = (p.old as { id?: string }).id;
        if (id && !busy.current.has(id)) update((prev) => prev.filter((i) => i.id !== id || i.unsaved));
      })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          setLive(true);
          // Al reconectar se recoge lo que haya pasado mientras no había conexión.
          if (connectedBefore) void refresh();
          connectedBefore = true;
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          setLive(false);
        }
      });
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [householdId, refresh, update]);

  const sync: SyncState = inFlight > 0 ? 'saving' : stale || !live || items.some((i) => i.unsaved === 'failed') ? 'offline' : 'live';

  return { items, load, sync, stale, refresh, add, retry, discard, setBought, edit, finishTrip, draft, setDraft };
}

export type Shopping = ReturnType<typeof useShopping>;
