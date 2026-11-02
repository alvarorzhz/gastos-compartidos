import { useState } from 'react';
import { downloadFile } from '../lib/csv';
import { addMonths, formatMonth, monthOf, today } from '../lib/dates';
import { reportError } from '../lib/errorLog';
import { monthReport, reportFileName } from '../lib/monthReport';
import { Spinner, toast, type ViewProps } from './common';
import { Icon } from './icons';

/**
 * Descarga el resumen del mes en PDF. El dibujo (pdf-lib) se baja solo al pulsar, para no
 * hacer más pesada la app; el PDF se hace en el propio móvil y no se sube a ningún sitio.
 */
export default function ReportButton({ data, month, className = 'pill', label = 'Descargar PDF' }: Pick<ViewProps, 'data'> & {
  month: string;
  className?: string;
  label?: string;
}) {
  const [busy, setBusy] = useState(false);

  async function download() {
    setBusy(true);
    try {
      const { buildReportPdf } = await import('../lib/pdfReport');
      const bytes = await buildReportPdf(monthReport(data, month, today()));
      downloadFile(reportFileName(month), bytes, 'application/pdf');
      toast('Resumen en PDF listo');
    } catch (err) {
      reportError(err, 'resumen en PDF');
      toast('No se ha podido hacer el PDF. Prueba otra vez.', 'error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <button type="button" className={className} onClick={() => void download()} disabled={busy}>
      {busy ? <Spinner label="Preparando…" /> : <><Icon name="download" size={16} /> {label}</>}
    </button>
  );
}

/** En Ajustes → Tus datos: elegir el mes y descargar su resumen en PDF. */
export function MonthReportPicker({ data }: Pick<ViewProps, 'data'>) {
  const current = monthOf(today());
  const months = [...new Set([current, ...data.expenses.map((e) => monthOf(e.spent_on))])].filter((m) => m <= current).sort().reverse();
  // Por defecto el último mes acabado, que es el que tiene sentido guardar.
  const [month, setMonth] = useState(() => (months.includes(addMonths(current, -1)) ? addMonths(current, -1) : current));
  return (
    <div className="card report-picker">
      <div className="row">
        <span className="icon-tile accent"><Icon name="fileIn" /></span>
        <span className="row-main">
          <span className="row-title">Resumen del mes en PDF</span>
          <span className="row-meta">Para guardarlo o enseñarlo: gastos, categorías, saldo y evolución</span>
        </span>
      </div>
      <div className="row">
        <select className="grow" value={month} onChange={(e) => setMonth(e.target.value)} aria-label="Mes del resumen">
          {months.map((m) => <option key={m} value={m}>{formatMonth(m)}{m === current ? ' (en curso)' : ''}</option>)}
        </select>
        <ReportButton data={data} month={month} className="tinted" label="Descargar" />
      </div>
    </div>
  );
}
