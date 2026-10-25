import { useEffect, useId, useState, type FormEvent, type PointerEvent, type RefObject } from 'react';
import { formatQuantity, guessCategory, MAX_NAME, parseQuantity, parseQuickAdd, SHOP_CATEGORIES, SHOP_UNITS, shopCategory, suggestNames, type KnownProduct, type ShopCategory, type ShopUnit } from '../../lib/shopping';
import { emptyDraft, type ListItem, type NewItem, type Shopping } from '../../lib/useShopping';
import { Icon } from '../icons';


/* ───────────── Añadir productos ───────────── */

export function AddBar({ shopping, items, inputRef, onRequestAdd }: {
  shopping: Shopping;
  items: ListItem[];
  inputRef: RefObject<HTMLInputElement | null>;
  onRequestAdd: (input: NewItem, fromDraft: boolean) => boolean;
}) {
  const { draft, setDraft } = shopping;
  const id = useId();
  const [added, setAdded] = useState<string | null>(null);
  const [error, setError] = useState('');
  const parsed = parseQuickAdd(draft.text);
  const guessed = guessCategory(parsed.name, items);
  const category = draft.category ?? guessed;
  const suggestions = suggestNames(items, draft.text.trim().length >= 2 ? parsed.name : '', 4);

  useEffect(() => {
    if (!added) return;
    const t = setTimeout(() => setAdded(null), 2200);
    return () => clearTimeout(t);
  }, [added]);

  function submit(e?: FormEvent) {
    e?.preventDefault();
    if (!parsed.name) {
      inputRef.current?.focus();
      return;
    }
    if (parsed.name.length > MAX_NAME) {
      setError(`El nombre puede tener como mucho ${MAX_NAME} letras.`);
      return;
    }
    const quantity = parsed.quantity ?? parseQuantity(draft.quantity);
    if (quantity == null) {
      setError('La cantidad tiene que ser un número mayor que 0, como 1, 2 o 0,5.');
      return;
    }
    setError('');
    const input: NewItem = { name: parsed.name, quantity, unit: parsed.unit ?? draft.unit, category, important: draft.important };
    if (onRequestAdd(input, true)) {
      setAdded(input.name);
      setDraft((d) => emptyDraft(d.details));
    }
    inputRef.current?.focus();
  }

  function pick(p: KnownProduct) {
    if (onRequestAdd({ name: p.last.name, quantity: p.last.quantity, unit: p.last.unit, category: p.last.category }, true)) {
      setAdded(p.last.name);
      setDraft((d) => emptyDraft(d.details));
    }
    inputRef.current?.focus();
  }

  const qty = parseQuantity(draft.quantity) ?? 1;
  const keepFocus = (e: PointerEvent) => e.preventDefault();

  return (
    <form className="shop-add" onSubmit={submit} noValidate>
      <div className="shop-add-row">
        <label className="sr-only" htmlFor={id}>Producto</label>
        <input
          id={id}
          ref={inputRef}
          className="shop-add-input"
          placeholder="Añadir producto…"
          autoComplete="off"
          autoCapitalize="sentences"
          enterKeyHint="enter"
          maxLength={MAX_NAME + 12}
          value={draft.text}
          aria-invalid={error ? true : undefined}
          onChange={(e) => {
            setError('');
            setDraft((d) => ({ ...d, text: e.target.value }));
          }}
        />
        <button
          type="button"
          className={'icon-btn shop-details-btn' + (draft.details ? ' active' : '')}
          aria-label="Cantidad, unidad y categoría"
          aria-expanded={draft.details}
          onPointerDown={keepFocus}
          onClick={() => setDraft((d) => ({ ...d, details: !d.details }))}
        >
          <Icon name="sliders" />
        </button>
        <button type="submit" className="primary shop-add-btn" onPointerDown={keepFocus} disabled={!draft.text.trim()}>
          <Icon name="plus" size={18} /> <span>Añadir</span>
        </button>
      </div>

      {suggestions.length > 0 && (
        <div className="chips" aria-label="Productos que ya habéis comprado">
          {suggestions.map((p) => (
            <button key={p.key} type="button" className="chip" onPointerDown={keepFocus} onClick={() => pick(p)}>
              <Icon name="clock" size={14} /> {p.name}
            </button>
          ))}
        </div>
      )}

      {draft.details && (
        <div className="shop-details">
          {parsed.quantity != null && <p className="field-hint">Has escrito la cantidad en el texto: se usará esa.</p>}
          <div className="shop-details-line">
            <span className="field-label">Cantidad</span>
            <div className="stepper">
              <button type="button" className="icon-btn" aria-label="Menos" onPointerDown={keepFocus} disabled={qty <= 1}
                onClick={() => setDraft((d) => ({ ...d, quantity: String(Math.max(1, Math.ceil(qty) - 1)) }))}>
                <Icon name="minus" size={18} />
              </button>
              <input
                aria-label="Cantidad"
                inputMode="decimal"
                value={draft.quantity}
                onChange={(e) => setDraft((d) => ({ ...d, quantity: e.target.value }))}
              />
              <button type="button" className="icon-btn" aria-label="Más" onPointerDown={keepFocus}
                onClick={() => setDraft((d) => ({ ...d, quantity: String(Math.floor(qty) + 1) }))}>
                <Icon name="plus" size={18} />
              </button>
            </div>
          </div>
          <UnitChips value={draft.unit} onChange={(unit) => setDraft((d) => ({ ...d, unit }))} keepFocus={keepFocus} />
          <CategoryChips value={category} auto={draft.category == null && parsed.name !== ''} onChange={(c) => setDraft((d) => ({ ...d, category: c }))} keepFocus={keepFocus} />
          <label className="check-line">
            <input type="checkbox" checked={draft.important} onChange={(e) => setDraft((d) => ({ ...d, important: e.target.checked }))} />
            <Icon name="star" size={18} /> Importante (sale el primero)
          </label>
        </div>
      )}

      {parsed.name && !error && (
        <p className="shop-preview">
          Se añadirá{' '}
          <strong>{formatQuantity(parsed.quantity ?? parseQuantity(draft.quantity) ?? 1, parsed.unit ?? draft.unit) || '1'}</strong>
          {' · '}<ShopCategoryIcon category={category} /> {shopCategory(category).label}
          {!draft.details && <span className="faint"> · puedes escribir «2 kg patatas» o «leche x6»</span>}
        </p>
      )}
      {error && <p className="error" role="alert">{error}</p>}
      <p className="shop-added" aria-live="polite">
        {added && <><Icon name="check" size={16} /> «{added}» añadido</>}
      </p>
    </form>
  );
}

export function UnitChips({ value, onChange, keepFocus }: { value: ShopUnit | null; onChange: (u: ShopUnit | null) => void; keepFocus?: (e: PointerEvent) => void }) {
  return (
    <div className="shop-details-line">
      <span className="field-label">Unidad</span>
      <div className="filter-row" role="group" aria-label="Unidad">
        <button type="button" className={'chip' + (value == null ? ' selected' : '')} aria-pressed={value == null} onPointerDown={keepFocus} onClick={() => onChange(null)}>Sin unidad</button>
        {SHOP_UNITS.map((u) => (
          <button key={u.id} type="button" className={'chip' + (value === u.id ? ' selected' : '')} aria-pressed={value === u.id} onPointerDown={keepFocus} onClick={() => onChange(u.id)}>
            {u.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export function CategoryChips({ value, auto, onChange, keepFocus }: { value: ShopCategory; auto?: boolean; onChange: (c: ShopCategory) => void; keepFocus?: (e: PointerEvent) => void }) {
  return (
    <div className="shop-details-line">
      <span className="field-label">Categoría{auto && <span className="faint"> · elegida por la app</span>}</span>
      <div className="filter-row" role="group" aria-label="Categoría">
        {SHOP_CATEGORIES.map((c) => (
          <button key={c.id} type="button" className={'chip shop-cat-chip' + (value === c.id ? ' selected' : '')} aria-pressed={value === c.id} onPointerDown={keepFocus} onClick={() => onChange(c.id)}>
            <Icon name={c.icon} size={16} /> {c.label}
          </button>
        ))}
      </div>
    </div>
  );
}

/* ───────────── Filas de la lista ───────────── */

export function ShopCategoryIcon({ category, size = 'sm' }: { category: ShopCategory; size?: 'sm' | 'md' }) {
  const c = shopCategory(category);
  return (
    <span className={`cat-icon cat-icon-${size} tone-${c.tone} shop-cat-icon`} aria-hidden>
      <Icon name={c.icon} size={size === 'sm' ? 16 : 20} />
    </span>
  );
}
