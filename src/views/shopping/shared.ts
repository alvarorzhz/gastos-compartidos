import { formatShortDay, toIsoDate, today } from '../../lib/dates';
import { nameOf } from '../../lib/people';
import { type ListItem, type NewItem } from '../../lib/useShopping';
import { type ViewProps } from '../common';

/** Cómo se ve la lista: en orden o por pasillos. */
export type Mode = 'lista' | 'categorias';

export type Duplicate = { existing: ListItem; input: NewItem; fromDraft: boolean };

export function byWhom(data: ViewProps['data'], me: string, userId: string): string {
  return userId === me ? 'por ti' : `por ${nameOf(data.members, userId)}`;
}

export function boughtWhen(iso: string): string {
  const d = new Date(iso);
  const day = toIsoDate(d);
  const time = d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
  return day === today() ? `hoy a las ${time}` : formatShortDay(day);
}
