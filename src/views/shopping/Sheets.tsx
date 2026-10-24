import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { formatShortDay, toIsoDate, today } from '../../lib/dates';
import { centsToInput, formatEuros, parseEuros } from '../../lib/money';
import { boughtHistory, formatQuantity, MAX_NAME, parseQuantity, SHOP_CATEGORIES, shopCategory, type ShopCategory, type ShopUnit } from '../../lib/shopping';
import { type ListItem, type Shopping } from '../../lib/useShopping';
import { EmptyState, Notice, Sheet, toast, type ViewProps } from '../common';
import { Icon } from '../icons';
import { deleteWithUndo } from '../undo';
import { ShopCategoryIcon, UnitChips } from './AddBar';
import { byWhom, type Duplicate } from './shared';

/* ───────────── Ya está en la lista ───────────── */

export function DuplicateSheet({ duplicate, shopping, onAddAnyway, onEdit, onDone }: {
  duplicate: Duplicate;
  shopping: Shopping;
  onAddAnyway: () => void;
  onEdit: () => void;
  onDone: (clearDraft: boolean) => void;
}) {
  const { existing, input } = duplicate;
  const [busy, setBusy] = useState(false);
  // Se pueden sumar si la unidad es la misma (o no se ha dicho ninguna).
  const sameUnit = input.unit == null || input.unit === existing.unit;
  const total = Math.min(9999, Number(existing.quantity) + input.quantity);
  const now = formatQuantity(existing.quantity, existing.unit) || '1';

  async function increase() {
    setBusy(true);
    const r = await shopping.edit(existing, { quantity: total });
    setBusy(false);
    if (r.ok) {
      toast(`«${existing.name}»: ahora ${formatQuantity(total, existing.unit) || total}`);
      onDone(true);
    } else {
      toast(r.message, r.reason === 'conflict' ? 'info' : 'error');
      if (r.reason === 'conflict') onDone(false);
    }
  }

  return (
    <Sheet
      title={`«${existing.name}» ya está en la lista`}
      subtitle={`Pendiente: ${now} · ${shopCategory(existing.category).label}`}
      onClose={() => onDone(false)}
      footer={<button className="secondary block" onClick={() => onDone(false)} disabled={busy}>Cancelar</button>}
    >
      <div className="stack-sm">
        {sameUnit && (
          <button className="primary lg block" onClick={() => void increase()} disabled={busy}>
            <Icon name="plus" size={18} /> {busy ? 'Guardando…' : `Sumar y dejar ${formatQuantity(total, existing.unit) || total}`}
          </button>
        )}
        <button className="tinted lg block" onClick={onEdit} disabled={busy}>
          <Icon name="edit" size={18} /> Editar el que ya está
        </button>
        <button className="secondary lg block" onClick={onAddAnyway} disabled={busy}>
          Añadirlo aparte (otra entrada)
        </button>
      </div>
    </Sheet>
  );
}

/* ───────────── Editar un producto ───────────── */

export function EditSheet({ item: opened, live, shopping, onClose }: {
  /** El producto tal y como estaba al abrirlo (para no pisar cambios de la pareja). */
  item: ListItem;
  /** El producto como está ahora (llega en tiempo real). */
  live: ListItem | undefined;
  shopping: Shopping;
  onClose: () => void;
}) {
  const formId = useId();
  const [item, setItem] = useState(opened);
  const [name, setName] = useState(item.name);
  const [quantity, setQuantity] = useState(String(item.quantity).replace('.', ','));
  const [unit, setUnit] = useState<ShopUnit | null>(item.unit);
  const [category, setCategory] = useState<ShopCategory>(item.category);
  const [important, setImportant] = useState(item.important);
  const [price, setPrice] = useState(item.estimated_cents != null ? centsToInput(item.estimated_cents) : '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const qty = parseQuantity(quantity);

  // Si mientras se edita la otra persona lo marca como comprado o lo quita, se avisa y se cierra.
  const gone = !live || live.status !== 'pending';
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    if (gone) {
      toast(`«${item.name}» ya no está pendiente: lo acaban de marcar como comprado o quitar.`, 'info');
      closeRef.current();
    }
  }, [gone, item.name]);
  const changedByPartner = live != null && !gone && live.updated_at !== item.updated_at;

  function applyTheirs() {
    if (!live) return;
    setItem(live);
    setName(live.name);
    setQuantity(String(live.quantity).replace('.', ','));
    setUnit(live.unit);
    setCategory(live.category);
    setImportant(live.important);
    setPrice(live.estimated_cents != null ? centsToInput(live.estimated_cents) : '');
  }

  async function save(e: FormEvent) {
    e.preventDefault();
    const n = name.trim();
    if (!n) return setError('Escribe el nombre del producto.');
    if (qty == null) return setError('La cantidad tiene que ser un número mayor que 0, como 1, 2 o 0,5.');
    const cents = price.trim() ? parseEuros(price) : null;
    if (price.trim() && (cents == null || cents <= 0)) return setError('El precio aproximado no es válido.');
    setError('');
    setBusy(true);
    const r = await shopping.edit(item, { name: n, quantity: qty, unit, category, important, estimated_cents: cents });
    setBusy(false);
    if (r.ok) {
      toast('Cambios guardados');
      onClose();
    } else if (r.reason === 'conflict') {
      toast(r.message, 'info');
      onClose();
    } else {
      setError(r.message);
    }
  }

  function remove() {
    if (item.unsaved) shopping.discard(item.id);
    else deleteWithUndo({ table: 'shopping_items', id: item.id, done: `«${item.name}» quitado de la lista`, reload: shopping.refresh });
    onClose();
  }

  return (
    <Sheet
      title="Editar producto"
      onClose={onClose}
      footer={
        <div className="row">
          <button type="button" className="danger" onClick={remove} disabled={busy}><Icon name="trash" size={18} /> Quitar</button>
          <button type="submit" form={formId} className="primary lg" disabled={busy}>{busy ? 'Guardando…' : 'Guardar'}</button>
        </div>
      }
    >
      <form id={formId} className="stack" onSubmit={save} noValidate>
        {changedByPartner && (
          <Notice kind="warn" action={<button type="button" className="sm tinted" onClick={applyTheirs}>Ver su versión</button>}>
            Tu pareja acaba de cambiar este producto. Mira su versión antes de guardar para no deshacer su cambio.
          </Notice>
        )}
        <div className="field">
          <label className="field-label" htmlFor={formId + '-name'}>Producto</label>
          <input id={formId + '-name'} value={name} maxLength={MAX_NAME} onChange={(e) => setName(e.target.value)} autoComplete="off" />
        </div>
        <div className="shop-details-line">
          <span className="field-label">Cantidad</span>
          <div className="stepper">
            <button type="button" className="icon-btn" aria-label="Menos" disabled={(qty ?? 1) <= 1} onClick={() => setQuantity(String(Math.max(1, Math.ceil(qty ?? 1) - 1)))}>
              <Icon name="minus" size={18} />
            </button>
            <input aria-label="Cantidad" inputMode="decimal" value={quantity} aria-invalid={qty == null || undefined} onChange={(e) => setQuantity(e.target.value)} />
            <button type="button" className="icon-btn" aria-label="Más" onClick={() => setQuantity(String(Math.floor(qty ?? 0) + 1))}>
              <Icon name="plus" size={18} />
            </button>
          </div>
        </div>
        <UnitChips value={unit} onChange={setUnit} />
        <fieldset className="category-picker">
          <legend className="field-label">Categoría</legend>
          <div className="category-grid">
            {SHOP_CATEGORIES.map((c) => (
              <label key={c.id} className={category === c.id ? 'selected' : ''}>
                <input type="radio" name={formId + '-cat'} checked={category === c.id} onChange={() => setCategory(c.id)} />
                <ShopCategoryIcon category={c.id} />
                <span className="cat-name">{c.label}</span>
              </label>
            ))}
          </div>
        </fieldset>
        <label className="check-line">
          <input type="checkbox" checked={important} onChange={(e) => setImportant(e.target.checked)} />
          <Icon name="star" size={18} /> Importante (sale el primero)
        </label>
        <div className="field">
          <label className="field-label" htmlFor={formId + '-price'}>Precio aproximado (opcional)</label>
          <input id={formId + '-price'} inputMode="decimal" placeholder="Por ejemplo 2,50" value={price} onChange={(e) => setPrice(e.target.value)} autoComplete="off" />
          <span className="field-hint">Para calcular cuánto costará la lista. Si lo dejas vacío, se usa lo que costó la última vez.</span>
        </div>
        {error && <p className="error" role="alert">{error}</p>}
      </form>
    </Sheet>
  );
}

/* ───────────── Historial ───────────── */

const HISTORY_PAGE = 60;

export function HistorySheet({ items, data, me, onClose, onReAdd, onUndo, isOnList }: Pick<ViewProps, 'data' | 'me'> & {
  items: ListItem[];
  onClose: () => void;
  onReAdd: (i: ListItem) => void;
  onUndo: (i: ListItem) => void;
  isOnList: (name: string) => boolean;
}) {
  const [shown, setShown] = useState(HISTORY_PAGE);
  const history = boughtHistory(items);
  const page = history.slice(0, shown);
  const days = [...new Set(page.map((i) => toIsoDate(new Date(i.bought_at!))))];

  return (
    <Sheet title="Historial de la compra" subtitle={`${history.length} productos comprados en total`} onClose={onClose}>
      {history.length === 0 ? (
        <EmptyState icon="clock" title="Todavía no habéis comprado nada" />
      ) : (
        <div className="stack">
          {days.map((day) => (
            <section key={day} className="day-group" aria-label={formatShortDay(day)}>
              <div className="day-head"><span>{day === today() ? 'Hoy' : formatShortDay(day)}</span></div>
              <ul className="list shop-list">
                {page.filter((i) => toIsoDate(new Date(i.bought_at!)) === day).map((i) => {
                  const on = isOnList(i.name);
                  return (
                    <li key={i.id} className="shop-history-row">
                      <ShopCategoryIcon category={i.category} />
                      <span className="row-main">
                        <span className="row-title">{i.name}</span>
                        <span className="row-meta">
                          {[formatQuantity(i.quantity, i.unit), i.price_cents != null && formatEuros(i.price_cents), i.bought_by && byWhom(data, me, i.bought_by), !i.cleared_at && 'en la compra actual'].filter(Boolean).join(' · ')}
                        </span>
                      </span>
                      {!i.cleared_at && (
                        <button className="sm secondary" onClick={() => onUndo(i)} aria-label={`Devolver ${i.name} a pendientes`}>
                          <Icon name="undo" size={16} /> Deshacer
                        </button>
                      )}
                      {i.cleared_at && (
                        <button className={'sm ' + (on ? 'secondary' : 'tinted')} onClick={() => onReAdd(i)} aria-label={on ? `${i.name}, ya en la lista` : `Volver a añadir ${i.name}`}>
                          <Icon name={on ? 'check' : 'plus'} size={16} /> {on ? 'En la lista' : 'Añadir'}
                        </button>
                      )}
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
          {history.length > shown && (
            <button className="secondary block" onClick={() => setShown(shown + HISTORY_PAGE)}>Ver más</button>
          )}
        </div>
      )}
    </Sheet>
  );
}
