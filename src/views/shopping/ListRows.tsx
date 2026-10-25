import { formatShortDay, toIsoDate, today } from '../../lib/dates';
import { formatEuros } from '../../lib/money';
import { type CheaperElsewhere } from '../../lib/storePrices';
import { formatQuantity, shopCategory, STARTER_PRODUCTS, type KnownProduct } from '../../lib/shopping';
import { type ListItem, type Shopping } from '../../lib/useShopping';
import { EmptyState, SectionHeader, Spinner } from '../common';
import { Icon } from '../icons';
import { ShopCategoryIcon } from './AddBar';
import { type Mode } from './shared';

/* ───────────── Indicador de conexión ───────────── */

export function SyncBadge({ shopping }: { shopping: Shopping }) {
  if (shopping.sync === 'saving') return <span className="sync-badge"><Spinner /> Guardando…</span>;
  if (shopping.sync === 'offline') {
    return (
      <button
        className="sync-badge offline"
        onClick={() => {
          void shopping.refresh();
          for (const i of shopping.items) if (i.unsaved === 'failed') void shopping.retry(i.id);
        }}
      >
        <Icon name="alert" size={16} /> Sin conexión · Reintentar
      </button>
    );
  }
  return <span className="sync-badge live" title="Los cambios de los dos se ven al momento"><span className="live-dot" aria-hidden /> Al día</span>;
}

export function PendingRow({ item, checked, mode, onToggle, onEdit, onRetry, onDiscard, priceOf, cheaperOf }: {
  item: ListItem;
  priceOf: (i: ListItem) => number | null;
  cheaperOf: (i: ListItem) => CheaperElsewhere | null;
  checked: boolean;
  mode: Mode;
  onToggle: (i: ListItem) => void;
  onEdit: (i: ListItem) => void;
  onRetry: (id: string) => void;
  onDiscard: (id: string) => void;
}) {
  const qty = formatQuantity(item.quantity, item.unit);
  const cat = shopCategory(item.category);
  const price = item.unsaved ? null : priceOf(item);
  const cheaper = item.unsaved ? null : cheaperOf(item);
  return (
    <li className={'shop-item' + (checked ? ' leaving' : '') + (item.unsaved === 'failed' ? ' failed' : '')}>
      <button
        className="shop-toggle"
        onClick={() => onToggle(item)}
        disabled={checked || item.unsaved != null}
        aria-label={`Marcar ${item.name} como comprado`}
      >
        <span className={'shop-check' + (checked ? ' checked' : '')} aria-hidden><Icon name="check" size={18} /></span>
        <span className="row-main">
          <span className="shop-name">
            {item.important && <Icon name="star" size={15} className="shop-star" label="Importante" />}
            {item.name}
          </span>
          {item.unsaved === 'failed' ? (
            <span className="row-meta negative">No se ha guardado</span>
          ) : mode === 'lista' ? (
            <span className="row-meta shop-meta">
              <ShopCategoryIcon category={item.category} /> {cat.label}{price != null && <> · unos {formatEuros(price)}</>}
            </span>
          ) : price != null ? (
            <span className="row-meta">unos {formatEuros(price)}</span>
          ) : null}
          {cheaper && (
            <span className="row-meta shop-cheaper">
              <Icon name="tag" size={14} /> En {cheaper.store}, {formatEuros(cheaper.cents)} ({formatEuros(cheaper.savingCents)} menos que en {cheaper.usualStore})
            </span>
          )}
        </span>
      </button>
      {item.unsaved === 'failed' ? (
        <span className="row shop-failed-actions">
          <button className="sm tinted" onClick={() => onRetry(item.id)}>Reintentar</button>
          <button className="icon-btn" aria-label={`Quitar ${item.name}`} onClick={() => onDiscard(item.id)}><Icon name="close" size={18} /></button>
        </span>
      ) : (
        <>
          {qty && <span className="shop-qty">{qty}</span>}
          <button className="icon-btn shop-edit" onClick={() => onEdit(item)} aria-label={`Editar ${item.name}`} disabled={checked || item.unsaved != null}>
            <Icon name="edit" size={18} />
          </button>
        </>
      )}
    </li>
  );
}

/* ───────────── Recientes y habituales ───────────── */

export function QuickProducts({ frequent, recent, hasHistory, filtering, onList, onAdd, onStarter, onHistory }: {
  frequent: KnownProduct[];
  recent: KnownProduct[];
  hasHistory: boolean;
  filtering: boolean;
  onList: (name: string) => boolean;
  onAdd: (p: KnownProduct) => void;
  onStarter: (name: string) => void;
  onHistory: () => void;
}) {
  return (
    <section className="section" aria-labelledby="shop-quick">
      <SectionHeader
        id="shop-quick"
        title="Recientes y habituales"
        action={hasHistory ? <button className="link-btn small" onClick={onHistory}><Icon name="clock" size={16} /> Historial</button> : undefined}
      />
      {!hasHistory ? (
        <div className="card">
          <EmptyState
            icon="clock"
            title="Aún no hay historial"
            text="Lo que compréis aparecerá aquí para volver a apuntarlo con un toque. Para empezar, toca lo que necesitéis:"
            action={
              <div className="chips shop-chips center-chips">
                {STARTER_PRODUCTS.map((name) => {
                  const on = onList(name);
                  return (
                    <button key={name} className={'chip shop-chip' + (on ? ' on-list' : '')} onClick={() => onStarter(name)} aria-label={on ? `${name}, ya en la lista` : `Añadir ${name}`}>
                      <Icon name={on ? 'check' : 'plus'} size={14} /> {name}
                    </button>
                  );
                })}
              </div>
            }
          />
        </div>
      ) : frequent.length + recent.length === 0 && filtering ? (
        <p className="muted small" style={{ padding: '0 var(--s1)' }}>Nada en recientes con esa búsqueda.</p>
      ) : (
        <div className="card shop-quick">
          {frequent.length > 0 && (
            <div className="stack-sm">
              <h3 className="stat-label">Habituales</h3>
              <div className="chips shop-chips">
                {frequent.map((p) => {
                  const on = onList(p.name);
                  return (
                    <button key={p.key} className={'chip shop-chip' + (on ? ' on-list' : '')} onClick={() => onAdd(p)} aria-label={on ? `${p.name}, ya en la lista` : `Añadir ${p.name}`}>
                      <Icon name={on ? 'check' : 'plus'} size={14} /> {p.name}
                      <span className="chip-count" aria-hidden>{p.count}×</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
          {recent.length > 0 && (
            <div className="stack-sm">
              <h3 className="stat-label">Recientes</h3>
              <ul className="shop-recent">
                {recent.map((p) => {
                  const on = onList(p.name);
                  const qty = formatQuantity(p.last.quantity, p.last.unit);
                  return (
                    <li key={p.key}>
                      <ShopCategoryIcon category={p.last.category} />
                      <span className="row-main">
                        <span className="row-title">{p.name}</span>
                        <span className="row-meta">{[qty, `comprado ${toIsoDate(new Date(p.lastBoughtAt)) === today() ? 'hoy' : formatShortDay(toIsoDate(new Date(p.lastBoughtAt)))}`].filter(Boolean).join(' · ')}</span>
                      </span>
                      <button className={'icon-btn shop-readd' + (on ? ' on-list' : '')} onClick={() => onAdd(p)} aria-label={on ? `${p.name}, ya en la lista` : `Añadir ${p.name}`}>
                        <Icon name={on ? 'check' : 'plus'} size={18} />
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
          <p className="faint xsmall">Los habituales son lo que más compráis; un toque lo vuelve a apuntar con la misma cantidad.</p>
        </div>
      )}
    </section>
  );
}
