import { nameOf } from './people';
import type { Expense, Member } from './types';

/**
 * Cambios a la vez en un mismo gasto: si mientras uno lo edita el otro lo cambia
 * o lo borra, al guardar no se pisa sin avisar.
 */
export type EditState = 'same' | 'changed' | 'deleted';

/** Compara el gasto tal como estaba al abrirlo con el que hay ahora. */
export function editState(base: Pick<Expense, 'updated_at'>, current: Pick<Expense, 'updated_at'> | null | undefined): EditState {
  if (!current) return 'deleted';
  return sameMoment(current.updated_at, base.updated_at) ? 'same' : 'changed';
}

/** Dos fechas iguales aunque vengan escritas distinto ("+00:00" frente a "Z"). */
function sameMoment(a: string, b: string): boolean {
  if (a === b) return true;
  const ta = Date.parse(a);
  const tb = Date.parse(b);
  // Date solo llega a milésimas: si difieren las cifras de después, se toma como distinto.
  return !Number.isNaN(ta) && ta === tb && micros(a) === micros(b);
}

function micros(s: string): string {
  return (s.match(/\.(\d+)/)?.[1] ?? '').padEnd(6, '0');
}

/** Título del aviso: "Patri ha cambiado este gasto", "Has borrado este gasto desde otro móvil"… */
export function conflictTitle(state: Exclude<EditState, 'same'>, changedBy: string | null | undefined, members: Member[], me: string): string {
  const verb = state === 'changed' ? 'cambiado' : 'borrado';
  if (changedBy === me) return `Has ${verb} este gasto desde otro móvil`;
  const partner = members.find((m) => m.user_id !== me);
  const who = changedBy ? nameOf(members, changedBy, me) : changedBy === null ? 'La app' : partner?.display_name ?? 'Tu pareja';
  return `${who} ha ${verb} este gasto`;
}
