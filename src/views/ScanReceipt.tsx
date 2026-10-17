import { useRef, useState } from 'react';
import { readReceipt } from '../lib/ocr';
import type { ReceiptGuess } from '../lib/receipt';
import { Spinner } from './common';
import { Icon } from './icons';

/**
 * Botón para hacer una foto al ticket y leerlo en el propio móvil (Tesseract).
 * La foto no se sube a ningún sitio ni se guarda: se lee y se descarta.
 */
export default function ScanReceipt({ onResult, label = 'Escanear ticket', primary = false }: {
  onResult: (guess: ReceiptGuess) => void;
  label?: string;
  primary?: boolean;
}) {
  const input = useRef<HTMLInputElement>(null);
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
      <button type="button" className={primary ? 'primary' : 'pill'} onClick={() => input.current?.click()} disabled={status != null}>
        {status ? <Spinner label={status} /> : <><Icon name="camera" size={18} /> {label}</>}
      </button>
      {error && <p className="error center" role="alert">{error}</p>}
    </div>
  );
}
