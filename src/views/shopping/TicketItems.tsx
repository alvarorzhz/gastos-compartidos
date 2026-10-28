import { formatEuros } from '../../lib/money';
import { MAX_NAME } from '../../lib/shopping';

/*
 * Productos de un ticket escaneado para revisar antes de guardar: cada uno con su precio, una
 * marca para guardarlo o no y, si es nuevo, su nombre (el del ticket suele venir abreviado).
 */

export interface TicketRow {
  key: number;
  name: string;
  cents: number;
  /** Nombre del producto de la lista con el que se ha emparejado; sin él, es nuevo. */
  listName?: string;
}

export function TicketItems({ rows, skipped, names, onToggle, onRename }: {
  rows: TicketRow[];
  skipped: Set<number>;
  names: Record<number, string>;
  onToggle: (key: number) => void;
  onRename: (key: number, name: string) => void;
}) {
  return (
    <ul className="ticket-items">
      {rows.map((r) => {
        const on = !skipped.has(r.key);
        const name = names[r.key] ?? r.name;
        return (
          <li key={r.key} className={'ticket-item' + (on ? '' : ' off')}>
            <input type="checkbox" checked={on} onChange={() => onToggle(r.key)} aria-label={`Guardar ${r.listName ?? name}`} />
            {r.listName ? (
              <span className="row-main">
                <span className="row-title">{r.listName}</span>
                <span className="row-meta">De tu lista · en el ticket: {r.name}</span>
              </span>
            ) : (
              <input
                className="ticket-item-name"
                aria-label={`Nombre de ${r.name}`}
                maxLength={MAX_NAME}
                value={name}
                disabled={!on}
                onChange={(e) => onRename(r.key, e.target.value)}
              />
            )}
            <span className="ticket-item-price">{formatEuros(r.cents)}</span>
          </li>
        );
      })}
    </ul>
  );
}
