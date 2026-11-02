import { useId, useState, type ReactNode } from 'react';
import type { Reliability } from '../lib/forecast';
import { Icon } from './icons';

const LABEL: Record<Reliability, string> = {
  low: 'Pocos datos todavía',
  medium: 'Orientativa',
  good: 'Bastante fiable',
};

/** Pastilla con lo fiable que es una previsión. */
export function ReliabilityPill({ level }: { level: Reliability }) {
  return <span className={'reliability reliability-' + level}>{LABEL[level]}</span>;
}

/**
 * «¿De dónde sale?»: debajo de una previsión, qué datos usa, qué supone y por qué puede fallar.
 * Cerrado por defecto para no recargar la pantalla.
 */
export function ForecastInfo({ reliability, caveats, children, assumptions }: {
  reliability: Reliability;
  caveats: string[];
  /** Los datos con los que se calcula, en frases cortas. */
  children: ReactNode;
  /** Lo que da por hecho. */
  assumptions: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const id = useId();
  return (
    <div className="forecast-info">
      <div className="row forecast-info-head">
        <ReliabilityPill level={reliability} />
        <button type="button" className="link-btn small" aria-expanded={open} aria-controls={id} onClick={() => setOpen((v) => !v)}>
          {open ? 'Ocultar' : '¿De dónde sale?'}
        </button>
      </div>
      {open && (
        <div id={id} className="forecast-info-body">
          <p className="forecast-info-title">Con qué datos</p>
          <ul>{children}</ul>
          <p className="forecast-info-title">Qué supone</p>
          <p>{assumptions}</p>
          {caveats.length > 0 && (
            <>
              <p className="forecast-info-title">Por qué puede fallar</p>
              <ul className="forecast-caveats">
                {caveats.map((c) => <li key={c}><Icon name="alert" size={14} /><span>{c}</span></li>)}
              </ul>
            </>
          )}
        </div>
      )}
    </div>
  );
}
