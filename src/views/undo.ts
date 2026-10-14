import { useEffect, useState } from 'react';
import { errorMessage, supabase } from '../lib/supabase';
import type { HouseholdData } from '../lib/useHousehold';
import { toast } from './common';

/** Tiempo para tocar "Deshacer" antes de que el borrado sea definitivo. */
const UNDO_MS = 6000;

type Table = 'expenses' | 'settlements' | 'savings_contributions' | 'personal_entries';

/*
 * Borrar con "Deshacer": la fila se oculta al momento y se borra de verdad pasados unos
 * segundos, si nadie lo ha deshecho. Así no hay que volver a crearla (la otra persona
 * podría no tener permiso para apuntarla en su nombre).
 */
const hidden = new Set<string>();
const pending = new Map<string, { timer: ReturnType<typeof setTimeout>; commit: () => Promise<void> }>();
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());

export function deleteWithUndo({ table, id, done, reload }: { table: Table; id: string; done: string; reload: () => Promise<void> }) {
  hidden.add(id);
  notify();
  const commit = async () => {
    pending.delete(id);
    const { error } = await supabase.from(table).delete().eq('id', id);
    if (error) toast('No se ha podido borrar: ' + errorMessage(error), 'error');
    await reload();
    hidden.delete(id);
    notify();
  };
  const timer = setTimeout(() => void commit(), UNDO_MS);
  pending.set(id, { timer, commit });
  toast(done, 'success', {
    ms: UNDO_MS,
    action: {
      label: 'Deshacer',
      onClick: () => {
        const p = pending.get(id);
        if (!p) return;
        clearTimeout(p.timer);
        pending.delete(id);
        hidden.delete(id);
        notify();
        toast('Recuperado', 'info');
      },
    },
  });
}

/** Hace ya los borrados pendientes (al salir de la app no se espera a que pase el tiempo). */
export function flushPendingDeletes() {
  for (const p of [...pending.values()]) {
    clearTimeout(p.timer);
    void p.commit();
  }
}

/** Ids que se están borrando y no deben mostrarse. */
export function useHiddenIds(): Set<string> {
  const [, setTick] = useState(0);
  useEffect(() => {
    const l = () => setTick((n) => n + 1);
    listeners.add(l);
    return () => void listeners.delete(l);
  }, []);
  return hidden;
}

/** Los datos sin lo que está pendiente de borrar. */
export function withoutHidden(data: HouseholdData, ids: Set<string>): HouseholdData {
  if (ids.size === 0) return data;
  const keep = <T extends { id: string }>(rows: T[]) => rows.filter((r) => !ids.has(r.id));
  return { ...data, expenses: keep(data.expenses), settlements: keep(data.settlements), contributions: keep(data.contributions), personal: keep(data.personal) };
}
