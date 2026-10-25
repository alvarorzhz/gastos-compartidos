import { useMemo } from 'react';
import { formatShortDay, today } from '../../lib/dates';
import { formatEuros } from '../../lib/money';
import { listEstimate, shoppingBudgetLeft, shoppingCategory } from '../../lib/shoppingPrices';
import { compareProducts, listSavingsByStore } from '../../lib/storePrices';
import { SHOP_UNITS } from '../../lib/shopping';
import { type ListItem } from '../../lib/useShopping';
import { EmptyState, Sheet, type ViewProps } from '../common';
import { Icon } from '../icons';


/* ───────────── Lo que costará la lista ───────────── */

/** "Unos 42 € · 3 sin precio" y lo que queda del presupuesto de la compra este mes. */
export function ListCost({ data, items }: { data: ViewProps['data']; items: ListItem[] }) {
  const estimate = listEstimate(items);
  if (estimate.priced === 0) return null;
  const category = shoppingCategory(data.categories, data.expenses, items);
  const left = category ? shoppingBudgetLeft(category, data.expenses, data.budgets, today()) : null;
  const after = left == null ? null : left - estimate.cents;
  return (
    <div className="shop-cost">
      <p className="shop-cost-main">
        <Icon name="receipt" size={18} />
        <span>
          <strong>Unos {formatEuros(estimate.cents)}</strong>
          {estimate.missing > 0 && <span className="muted"> · {estimate.missing === 1 ? '1 producto sin precio' : `${estimate.missing} productos sin precio`}</span>}
        </span>
      </p>
      {category && left != null && after != null && (
        <p className={'small ' + (after < 0 ? 'negative' : 'muted')}>
          {left <= 0
            ? `Ya os habéis pasado del presupuesto de ${category.name} este mes.`
            : after < 0
              ? `Con esta lista os pasaríais ${formatEuros(-after)} del presupuesto de ${category.name}.`
              : `Os quedan ${formatEuros(left)} de ${category.name} este mes (después de esta lista, unos ${formatEuros(after)}).`}
        </p>
      )}
    </div>
  );
}

/* ───────────── Dónde sale más barato ───────────── */

/** "En Lidl, 4 productos de la lista os salen unos 2,80 € más baratos" y el enlace a comparar precios. */
export function StoreSavings({ data, items, onCompare }: { data: ViewProps['data']; items: ListItem[]; onCompare: () => void }) {
  const savings = useMemo(() => listSavingsByStore(items, data.expenses), [items, data.expenses]);
  const canCompare = useMemo(() => savings.length > 0 || compareProducts(items, data.expenses).length > 0, [savings, items, data.expenses]);
  if (!canCompare) return null;
  const best = savings[0];
  return (
    <div className="shop-cost">
      {best ? (
        <p className="shop-cost-main">
          <Icon name="tag" size={18} />
          <span>
            En <strong>{best.store}</strong>, {best.count === 1 ? '1 producto de la lista sale' : `${best.count} productos de la lista salen`} unos{' '}
            <strong className="positive">{formatEuros(best.savingCents)}</strong> más {best.count === 1 ? 'barato' : 'baratos'} que donde los comprasteis la última vez.
          </span>
        </p>
      ) : null}
      <button className="link-btn small" onClick={onCompare}>Comparar precios por tienda</button>
    </div>
  );
}

/** Cada producto comprado en varias tiendas, con lo que costó en cada una. */
export function CompareSheet({ data, items, onClose }: { data: ViewProps['data']; items: ListItem[]; onClose: () => void }) {
  const products = useMemo(() => compareProducts(items, data.expenses), [items, data.expenses]);
  return (
    <Sheet
      title="Dónde sale más barato"
      subtitle="Con los precios de los tickets de los últimos 6 meses. Es el último precio de cada tienda."
      onClose={onClose}
    >
      {products.length === 0 ? (
        <EmptyState
          icon="tag"
          title="Aún no hay con qué comparar"
          text="Al terminar una compra, escanead el ticket. Cuando un producto se haya comprado en dos tiendas, aquí veréis dónde salió más barato."
        />
      ) : (
        <ul className="list shop-compare">
          {products.map((p) => {
            const unit = p.unit ? SHOP_UNITS.find((u) => u.id === p.unit)!.one : null;
            return (
              <li key={p.name + (p.unit ?? '')} className="shop-compare-row">
                <span className="row-title">{p.name}{unit && <span className="muted"> · por {unit}</span>}</span>
                <ul className="shop-compare-prices">
                  {p.prices.map((s, idx) => (
                    <li key={s.store} className={idx === 0 ? 'positive' : ''}>
                      <span>{idx === 0 && <Icon name="check" size={14} />} {s.store} <span className="muted xsmall">· {formatShortDay(s.boughtAt.slice(0, 10))}</span></span>
                      <span className="money">{formatEuros(s.unitCents)}</span>
                    </li>
                  ))}
                </ul>
              </li>
            );
          })}
        </ul>
      )}
    </Sheet>
  );
}
