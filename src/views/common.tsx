import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { categoryStyle } from '../lib/categoryStyle';
import { personColor } from '../lib/couple';
import { addMonths, formatMonth, monthOf, today } from '../lib/dates';
import type { Member } from '../lib/types';
import type { HouseholdData } from '../lib/useHousehold';
import { Icon, type IconName } from './icons';

/*
 * Piezas comunes de la interfaz: todas las pantallas se construyen con ellas para que
 * la app se vea y se comporte igual en todas partes. Los estilos están en styles.css.
 */

export interface ViewProps {
  data: HouseholdData;
  me: string;
  reload: () => Promise<void>;
}

/* ───────────── Paneles (hoja inferior en móvil, ventana en escritorio) ───────────── */

// Pila de paneles abiertos: solo el de arriba responde a Escape.
const openSheets: number[] = [];
let sheetSeq = 0;

/**
 * Panel inferior para formularios y detalles. `footer` queda fijo abajo (el botón de guardar
 * siempre a mano) y el panel se ajusta al teclado del móvil para no quedar tapado.
 */
export function Sheet({ title, onClose, children, footer, subtitle }: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  subtitle?: ReactNode;
}) {
  const backdrop = useRef<HTMLDivElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    const id = ++sheetSeq;
    openSheets.push(id);
    const previous = document.activeElement as HTMLElement | null;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && openSheets[openSheets.length - 1] === id) closeRef.current();
    };
    document.addEventListener('keydown', onKey);
    document.body.classList.add('no-scroll');
    // Si nada pide el foco (autoFocus), se lleva al panel para que el teclado y los lectores de pantalla entren en él.
    if (!panel.current?.contains(document.activeElement)) panel.current?.focus({ preventScroll: true });
    return () => {
      openSheets.splice(openSheets.indexOf(id), 1);
      document.removeEventListener('keydown', onKey);
      if (openSheets.length === 0) document.body.classList.remove('no-scroll');
      previous?.focus?.({ preventScroll: true });
    };
  }, []);

  // En iPhone el teclado no encoge la pantalla: se ajusta el panel a la parte visible.
  useEffect(() => {
    const vv = window.visualViewport;
    const el = backdrop.current;
    if (!vv || !el) return;
    const update = () => {
      el.style.height = `${vv.height}px`;
      el.style.top = `${vv.offsetTop}px`;
    };
    update();
    vv.addEventListener('resize', update);
    vv.addEventListener('scroll', update);
    return () => {
      vv.removeEventListener('resize', update);
      vv.removeEventListener('scroll', update);
    };
  }, []);

  return (
    <div className="sheet-backdrop" ref={backdrop} onClick={onClose}>
      <div
        className="sheet"
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sheet-grabber" aria-hidden />
        <header className="sheet-header">
          <div className="grow">
            <h2 id={titleId}>{title}</h2>
            {subtitle && <p className="sheet-subtitle">{subtitle}</p>}
          </div>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Cerrar">
            <Icon name="close" />
          </button>
        </header>
        <div className="sheet-body">{children}</div>
        {footer && <div className="sheet-footer">{footer}</div>}
      </div>
    </div>
  );
}

/* ───────────── Cambio de mes ───────────── */

export function MonthNav({ month, onChange }: { month: string; onChange: (m: string) => void }) {
  const current = monthOf(today());
  return (
    <div className="month-nav">
      <button type="button" className="icon-btn" onClick={() => onChange(addMonths(month, -1))} aria-label="Mes anterior">
        <Icon name="chevronLeft" />
      </button>
      <div className="month-nav-label">
        <strong aria-live="polite">{formatMonth(month)}</strong>
        {month !== current && (
          <button type="button" className="link-btn small" onClick={() => onChange(current)}>Volver a este mes</button>
        )}
      </div>
      <button type="button" className="icon-btn" onClick={() => onChange(addMonths(month, 1))} aria-label="Mes siguiente">
        <Icon name="chevronRight" />
      </button>
    </div>
  );
}

/* ───────────── Selector de opciones (control segmentado) ───────────── */

export function Segmented<T extends string>({ legend, value, options, onChange, hideLegend, size }: {
  legend: string;
  value: T;
  options: { value: T; label: ReactNode }[];
  onChange: (v: T) => void;
  hideLegend?: boolean;
  size?: 'sm';
}) {
  const name = useId();
  return (
    <fieldset className={'segmented' + (size ? ' segmented-' + size : '')}>
      <legend className={hideLegend ? 'sr-only' : 'field-label'}>{legend}</legend>
      <div className="segmented-track">
        {options.map((o) => (
          <label key={o.value} className={value === o.value ? 'selected' : ''}>
            <input type="radio" name={name} checked={value === o.value} onChange={() => onChange(o.value)} />
            <span>{o.label}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

/* ───────────── Iconos de categoría y personas ───────────── */

export function CategoryIcon({ name, size = 'md' }: { name: string; size?: 'sm' | 'md' | 'lg' }) {
  const style = categoryStyle(name);
  return (
    <span className={`cat-icon cat-icon-${size} tone-${style.tone}`} aria-hidden>
      <Icon name={style.icon} size={size === 'sm' ? 16 : size === 'lg' ? 24 : 20} />
    </span>
  );
}

/** Color de cada persona: el que eligió en Ajustes o, si no, el de quien creó el espacio y el de quien se unió. */
export function personTone(members: Member[], userId: string): string {
  return personColor(members, userId);
}

/** Inicial de la persona sobre su color, o su emoji si lo ha elegido. */
export function Avatar({ members, userId, size = 'md', className = '' }: { members: Member[]; userId: string; size?: 'sm' | 'md' | 'lg'; className?: string }) {
  const member = members.find((m) => m.user_id === userId);
  const name = member?.display_name ?? '?';
  return (
    <span className={`avatar avatar-${size} person-${personTone(members, userId)}${member?.emoji ? ' avatar-emoji' : ''} ${className}`.trim()} aria-hidden>
      {member?.emoji || name.trim().charAt(0).toUpperCase() || '?'}
    </span>
  );
}

/* ───────────── Barras de progreso ───────────── */

/** Barra de gasto frente a presupuesto: verde, ámbar al acercarse y coral si se pasa. */
export function Progress({ value, max, label, tone }: { value: number; max: number; label: string; tone?: 'saving' }) {
  const ratio = max > 0 ? value / max : 0;
  const level = tone ?? (ratio > 1 ? 'over' : ratio >= 0.85 ? 'warn' : 'ok');
  const percent = Math.round(ratio * 100);
  return (
    <div
      className={'progress progress-' + level}
      role="progressbar"
      aria-label={label}
      aria-valuenow={Math.max(0, percent)}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuetext={`${percent} %`}
    >
      <div style={{ width: `${Math.max(0, Math.min(ratio, 1)) * 100}%` }} />
    </div>
  );
}

/* ───────────── Estados vacíos, avisos y carga ───────────── */

export function EmptyState({ icon, title, text, action }: { icon: IconName; title: string; text?: ReactNode; action?: ReactNode }) {
  return (
    <div className="empty-state">
      <span className="empty-icon"><Icon name={icon} size={26} /></span>
      <p className="empty-title">{title}</p>
      {text && <p className="empty-text">{text}</p>}
      {action}
    </div>
  );
}

export function Notice({ kind = 'info', icon, children, action }: {
  kind?: 'info' | 'warn' | 'over' | 'success' | 'error';
  icon?: IconName;
  children: ReactNode;
  action?: ReactNode;
}) {
  const fallback: IconName = kind === 'warn' || kind === 'over' || kind === 'error' ? 'alert' : kind === 'success' ? 'check' : 'info';
  return (
    <div className={'notice notice-' + kind} role={kind === 'error' ? 'alert' : undefined}>
      <Icon name={icon ?? fallback} size={18} />
      <div className="grow">{children}</div>
      {action}
    </div>
  );
}

export function Spinner({ label }: { label?: string }) {
  return (
    <span className="spinner-wrap" role="status">
      <span className="spinner" aria-hidden />
      {label && <span>{label}</span>}
    </span>
  );
}

export function SectionHeader({ title, action, id }: { title: string; action?: ReactNode; id?: string }) {
  return (
    <div className="section-header">
      <h2 id={id}>{title}</h2>
      {action}
    </div>
  );
}

/* ───────────── Mensajes breves (confirmación de acciones) ───────────── */

type ToastKind = 'success' | 'error' | 'info';
interface ToastAction { label: string; onClick: () => void }
interface ToastItem { id: number; text: string; kind: ToastKind; action?: ToastAction; ms: number }
const toastListeners = new Set<(t: ToastItem) => void>();
let toastSeq = 0;

/**
 * Muestra un mensaje breve abajo, por ejemplo "Gasto guardado".
 * Con `action` lleva un botón (p. ej. Deshacer) y dura `ms` milisegundos.
 */
export function toast(text: string, kind: ToastKind = 'success', options: { action?: ToastAction; ms?: number } = {}) {
  const item = { id: ++toastSeq, text, kind, action: options.action, ms: options.ms ?? (kind === 'error' ? 6000 : 2800) };
  toastListeners.forEach((l) => l(item));
}

/** Pequeña fiesta en pantalla (corazones y confeti) con un mensaje: al quedar en paz o al cerrar un buen mes. */
export function celebrate(text: string) {
  toast(text);
  if (typeof document === 'undefined' || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
  const layer = document.createElement('div');
  layer.className = 'celebration';
  layer.setAttribute('aria-hidden', 'true');
  const pieces = ['🤍', '💚', '✨', '🎉', '💜', '🥳'];
  for (let i = 0; i < 36; i++) {
    const piece = document.createElement('span');
    piece.textContent = pieces[i % pieces.length];
    piece.style.left = `${Math.random() * 100}%`;
    piece.style.animationDelay = `${Math.random() * 0.6}s`;
    piece.style.animationDuration = `${1.8 + Math.random() * 1.2}s`;
    piece.style.setProperty('--drift', `${(Math.random() - 0.5) * 120}px`);
    piece.style.setProperty('--spin', `${(Math.random() - 0.5) * 540}deg`);
    layer.appendChild(piece);
  }
  document.body.appendChild(layer);
  setTimeout(() => layer.remove(), 3400);
}

export function Toaster() {
  const [items, setItems] = useState<ToastItem[]>([]);
  useEffect(() => {
    const add = (t: ToastItem) => {
      setItems((prev) => [...prev.slice(-2), t]);
      setTimeout(() => setItems((prev) => prev.filter((x) => x.id !== t.id)), t.ms);
    };
    toastListeners.add(add);
    return () => void toastListeners.delete(add);
  }, []);
  return (
    <div className="toaster" aria-live="polite">
      {items.map((t) => (
        <div key={t.id} className={'toast toast-' + t.kind + (t.action ? ' with-action' : '')} role={t.kind === 'error' ? 'alert' : 'status'}>
          <Icon name={t.kind === 'error' ? 'alert' : t.kind === 'success' ? 'check' : 'info'} size={18} />
          <span>{t.text}</span>
          {t.action && (
            <button
              className="toast-action"
              onClick={() => {
                setItems((prev) => prev.filter((x) => x.id !== t.id));
                t.action!.onClick();
              }}
            >
              {t.action.label}
            </button>
          )}
        </div>
      ))}
    </div>
  );
}

/* ───────────── Ventanas de confirmación (en lugar de las del navegador) ───────────── */

interface DialogRequest {
  title: string;
  message?: ReactNode;
  confirmLabel: string;
  danger?: boolean;
  /** Texto que hay que escribir para confirmar (p. ej. BORRAR). */
  typeToConfirm?: string;
  /** Si se pasa, la ventana pide un texto (con este valor inicial). */
  input?: { label: string; initial: string; maxLength: number };
  resolve: (value: string | boolean | null) => void;
}

let showDialog: ((r: DialogRequest) => void) | null = null;

/** Pide confirmación antes de una acción. Devuelve true si se confirma. */
export function confirmAction(opts: Omit<DialogRequest, 'resolve' | 'input'>): Promise<boolean> {
  return new Promise((resolve) => {
    if (!showDialog) return resolve(window.confirm(opts.title));
    showDialog({ ...opts, resolve: (v) => resolve(v === true) });
  });
}

/** Pide un texto (por ejemplo, el nuevo nombre de una categoría). Devuelve null si se cancela. */
export function askText(opts: { title: string; label: string; initial: string; maxLength: number; confirmLabel: string }): Promise<string | null> {
  return new Promise((resolve) => {
    if (!showDialog) return resolve(window.prompt(opts.title, opts.initial));
    showDialog({
      title: opts.title,
      confirmLabel: opts.confirmLabel,
      input: { label: opts.label, initial: opts.initial, maxLength: opts.maxLength },
      resolve: (v) => resolve(typeof v === 'string' ? v : null),
    });
  });
}

export function DialogHost() {
  const [request, setRequest] = useState<DialogRequest | null>(null);
  const [text, setText] = useState('');
  const titleId = useId();
  const inputId = useId();

  useEffect(() => {
    showDialog = (r) => {
      setText(r.input?.initial ?? '');
      setRequest(r);
    };
    return () => {
      showDialog = null;
    };
  }, []);

  useEffect(() => {
    if (!request) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        close(null);
      }
    };
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  });

  if (!request) return null;
  const r = request;
  function close(value: string | boolean | null) {
    setRequest(null);
    r.resolve(value);
  }
  const typed = !r.typeToConfirm || text.trim().toUpperCase() === r.typeToConfirm;
  const canConfirm = r.input ? text.trim() !== '' : typed;

  return (
    <div className="dialog-backdrop" onClick={() => close(null)}>
      <form
        className="dialog"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(e) => e.stopPropagation()}
        onSubmit={(e) => {
          e.preventDefault();
          if (canConfirm) close(r.input ? text.trim() : true);
        }}
      >
        <h2 id={titleId}>{r.title}</h2>
        {r.message && <div className="dialog-message">{r.message}</div>}
        {(r.input || r.typeToConfirm) && (
          <div className="field">
            <label className="field-label" htmlFor={inputId}>{r.input ? r.input.label : `Escribe ${r.typeToConfirm} para confirmar`}</label>
            <input
              id={inputId}
              autoFocus
              maxLength={r.input?.maxLength}
              autoCapitalize={r.typeToConfirm ? 'characters' : 'sentences'}
              value={text}
              onChange={(e) => setText(e.target.value)}
            />
          </div>
        )}
        <div className="dialog-actions">
          <button type="button" className="secondary" onClick={() => close(null)} autoFocus={!r.input && !r.typeToConfirm}>Cancelar</button>
          <button type="submit" className={r.danger ? 'danger-solid' : 'primary'} disabled={!canConfirm}>{r.confirmLabel}</button>
        </div>
      </form>
    </div>
  );
}

/** Mayúscula inicial ("cada mes" → "Cada mes"). */
export const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** Campo de importe grande y centrado, pensado para escribir con el teclado numérico del móvil. */
export function AmountField({ label, value, onChange, invalid, autoFocus, tone }: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  invalid?: boolean;
  autoFocus?: boolean;
  tone?: 'positive';
}) {
  const id = useId();
  return (
    <div className="amount-field">
      <label className="field-label" htmlFor={id}>{label}</label>
      <div className="amount-wrap">
        <input
          id={id}
          className={'amount-input' + (tone ? ' ' + tone : '')}
          style={{ width: `${Math.max(4, value.length + 0.5)}ch` }}
          inputMode="decimal"
          enterKeyHint="done"
          autoComplete="off"
          autoFocus={autoFocus}
          placeholder="0,00"
          aria-invalid={invalid || undefined}
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
        <span className="amount-currency" aria-hidden>€</span>
      </div>
      <div className="amount-underline" aria-hidden />
    </div>
  );
}

/*
 * Mes que se está viendo. Es el mismo en todas las pantallas: si miras septiembre en Gastos
 * y pasas a Presupuesto, sigues en septiembre. Empieza en el mes actual y, si la app se
 * queda abierta y se vuelve a ella en otro mes, salta al mes nuevo.
 */
let sharedMonth = monthOf(today());
let calendarMonth = sharedMonth;
const monthListeners = new Set<(month: string) => void>();

function setSharedMonth(month: string) {
  sharedMonth = month;
  monthListeners.forEach((l) => l(month));
}

function checkMonthChange() {
  const now = monthOf(today());
  if (document.visibilityState === 'visible' && now !== calendarMonth) {
    calendarMonth = now;
    setSharedMonth(now);
  }
}

export function useMonth(): [string, (month: string) => void] {
  const [month, setMonth] = useState(sharedMonth);
  useEffect(() => {
    monthListeners.add(setMonth);
    checkMonthChange();
    setMonth(sharedMonth);
    document.addEventListener('visibilitychange', checkMonthChange);
    const timer = setInterval(checkMonthChange, 60_000);
    return () => {
      monthListeners.delete(setMonth);
      document.removeEventListener('visibilitychange', checkMonthChange);
      clearInterval(timer);
    };
  }, []);
  return [month, setSharedMonth];
}

/** Como useState, pero el valor se conserva al cambiar de pantalla y volver (mientras la app siga abierta). */
const sticky = new Map<string, unknown>();
export function useSticky<T>(key: string, initial: T): [T, (value: T) => void] {
  const [value, setValue] = useState<T>(() => (sticky.has(key) ? (sticky.get(key) as T) : initial));
  const set = (v: T) => {
    sticky.set(key, v);
    setValue(v);
  };
  return [value, set];
}
