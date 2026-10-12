import { useEffect, type ReactNode } from 'react';
import { addMonths, formatMonth } from '../lib/dates';
import type { HouseholdData } from '../lib/useHousehold';

export interface ViewProps {
  data: HouseholdData;
  me: string;
  reload: () => Promise<void>;
}

/** Panel inferior a pantalla completa en móvil para formularios. */
export function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    document.body.classList.add('no-scroll');
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.classList.remove('no-scroll');
    };
  }, [onClose]);

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <div className="sheet-header">
          <h2>{title}</h2>
          <button className="icon" onClick={onClose} aria-label="Cerrar">✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function MonthNav({ month, onChange }: { month: string; onChange: (m: string) => void }) {
  return (
    <div className="month-nav">
      <button className="icon" onClick={() => onChange(addMonths(month, -1))} aria-label="Mes anterior">‹</button>
      <strong>{formatMonth(month)}</strong>
      <button className="icon" onClick={() => onChange(addMonths(month, 1))} aria-label="Mes siguiente">›</button>
    </div>
  );
}

