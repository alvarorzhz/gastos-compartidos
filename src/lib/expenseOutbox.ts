import { useEffect, useState } from 'react';
import { supabase } from './supabase';
import type { Expense } from './types';

/*
 * Gastos apuntados sin conexión.
 *
 * Si al guardar un gasto nuevo no hay internet, se queda guardado en el móvil y se ve en la
 * app como «Pendiente de subir». En cuanto vuelve la conexión (o al abrir la app) se sube.
 * Cada gasto lleva su id desde el móvil, así que si un envío llegó pero se cortó la
 * respuesta, al reintentar no se duplica.
 */

const KEY = 'gastos.gastosSinSubir';

interface Queued {
  /** Cuenta que lo apuntó: en un móvil compartido, cada uno sube solo lo suyo. */
  userId: string;
  row: Expense;
}

let queue: Queued[] = read();
const listeners = new Set<() => void>();

function read(): Queued[] {
  try {
    const all = JSON.parse(localStorage.getItem(KEY) ?? '[]') as Queued[];
    return Array.isArray(all) ? all.filter((q) => q && q.row && typeof q.row.id === 'string') : [];
  } catch {
    return [];
  }
}

function write(next: Queued[]) {
  queue = next;
  try {
    if (next.length) localStorage.setItem(KEY, JSON.stringify(next));
    else localStorage.removeItem(KEY);
  } catch {
    // Sin almacenamiento: el gasto sigue en pantalla mientras la app esté abierta.
  }
  listeners.forEach((l) => l());
}

/** ¿El error es por falta de conexión (y no porque algo no sea válido)? */
export function isOfflineError(err: unknown): boolean {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return true;
  const message = err && typeof err === 'object' && 'message' in err ? String((err as { message: unknown }).message) : '';
  return /failed to fetch|networkerror|load failed|network request failed|fetch failed/i.test(message);
}

export function queueExpense(userId: string, row: Expense) {
  write([...queue.filter((q) => q.row.id !== row.id), { userId, row }]);
}

export function updateQueued(id: string, fields: Partial<Expense>) {
  write(queue.map((q) => (q.row.id === id ? { ...q, row: { ...q.row, ...fields } } : q)));
}

export function removeQueued(id: string) {
  write(queue.filter((q) => q.row.id !== id));
}

export function isQueued(id: string): boolean {
  return queue.some((q) => q.row.id === id);
}

/** Gastos sin subir de esta cuenta y este espacio. */
export function queuedExpenses(userId: string, householdId: string): Expense[] {
  return queue.filter((q) => q.userId === userId && q.row.household_id === householdId).map((q) => q.row);
}

let flushing: Promise<string[]> | null = null;

/**
 * Sube los gastos pendientes de esta cuenta. Devuelve los ids que se han subido.
 * Si uno falla por algo que no es la conexión (p. ej. la categoría ya no existe), se queda
 * pendiente para que se pueda corregir o borrar desde la app.
 */
export function flushQueued(userId: string): Promise<string[]> {
  // Si ya se está subiendo, quien llega después no avisa otra vez de los mismos gastos.
  if (flushing) return flushing.then(() => []);
  flushing = (async () => {
    const sent: string[] = [];
    for (const q of queue.filter((x) => x.userId === userId)) {
      const { error } = await supabase.from('expenses').upsert(toInsert(q.row), { onConflict: 'id', ignoreDuplicates: true });
      if (error) {
        if (isOfflineError(error)) break;
        continue;
      }
      sent.push(q.row.id);
    }
    if (sent.length) write(queue.filter((q) => !sent.includes(q.row.id)));
    return sent;
  })().finally(() => {
    flushing = null;
  });
  return flushing;
}

/** Lo que se manda a la base de datos (sin las fechas que pone ella). */
export function toInsert(row: Expense) {
  const { updated_at: _u, created_at: _c, ...fields } = row;
  return fields;
}

/** Vuelve a pintar quien lo use cuando cambia la cola. */
export function useQueuedVersion(): number {
  const [version, setVersion] = useState(0);
  useEffect(() => {
    const l = () => setVersion((v) => v + 1);
    listeners.add(l);
    return () => void listeners.delete(l);
  }, []);
  return version;
}

/** Los datos con los gastos sin subir añadidos (al principio, como los más recientes). */
export function withQueued<T extends { expenses: Expense[]; household: { id: string } }>(data: T, userId: string): T {
  const pending = queuedExpenses(userId, data.household.id).filter((p) => !data.expenses.some((e) => e.id === p.id));
  if (pending.length === 0) return data;
  const expenses = [...pending, ...data.expenses].sort((a, b) => b.spent_on.localeCompare(a.spent_on));
  return { ...data, expenses };
}
