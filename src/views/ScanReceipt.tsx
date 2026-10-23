import { useRef, useState } from 'react';
import { readReceipt } from '../lib/ocr';
import type { ReceiptGuess } from '../lib/receipt';
import { Spinner } from './common';
import { Icon } from './icons';

/**
 * Botón para hacer una foto al ticket y leerlo en el propio móvil (Tesseract). Debajo, un enlace
 * para elegir una foto ya hecha o el ticket en PDF (el de la app de la tienda, que se lee perfecto).
 * Nada se sube a ningún sitio ni se guarda: se lee y se descarta.
 */
export default function ScanReceipt({ onResult, label = 'Escanear ticket', primary = false }: {
  onResult: (guess: ReceiptGuess) => void;
  label?: string;
  primary?: boolean;
}) {
  const input = useRef<HTMLInputElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function read(file: File) {
    setError(null);
    try {
      const guess = await readReceipt(file, setStatus);
      if (!guess || (guess.amountCents == null && guess.date == null && guess.lines.length === 0)) {
        setError('No he podido leer el ticket. Prueba con más luz, el ticket estirado y que salga entero, o escríbelo a mano.');
      } else {
        onResult(guess);
      }
    } catch {
      setError('No se ha podido leer el ticket. Revisa la conexión la primera vez (descarga el lector) o escríbelo a mano.');
    } finally {
      setStatus(null);
      if (input.current) input.current.value = '';
      if (fileInput.current) fileInput.current.value = '';
    }
  }

  return (
    <div className="stack-sm" style={{ alignItems: 'center' }}>
      <input
        ref={input}
        type="file"
        accept="image/*"
        capture="environment"
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void read(file);
        }}
      />
      {/* Sin "capture": el móvil deja elegir de la fototeca o de Archivos (el PDF de la tienda). */}
      <input
        ref={fileInput}
        type="file"
        accept="image/*,application/pdf,.pdf"
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void read(file);
        }}
      />
      <button type="button" className={primary ? 'primary' : 'pill'} onClick={() => input.current?.click()} disabled={status != null}>
        {status ? <Spinner label={status} /> : <><Icon name="camera" size={18} /> {label}</>}
      </button>
      {status == null && (
        <button type="button" className="link-btn small" onClick={() => fileInput.current?.click()}>
          o elegir una foto o el ticket en PDF
        </button>
      )}
      {error && <p className="error center" role="alert">{error}</p>}
    </div>
  );
}
