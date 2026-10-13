import { useRef, useState } from 'react';
import { today } from '../lib/dates';
import { parseReceipt, type ReceiptGuess } from '../lib/receipt';

/**
 * Botón para hacer una foto al ticket y leerlo en el propio móvil (Tesseract).
 * La foto no se sube a ningún sitio ni se guarda: se lee y se descarta.
 */
export default function ScanReceipt({ onResult }: { onResult: (guess: ReceiptGuess) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function read(file: File) {
    setError(null);
    setStatus('Preparando el lector…');
    try {
      const image = await prepare(file);
      const { createWorker } = await import('tesseract.js');
      // Todo se sirve desde la propia web (public/ocr): la foto no sale del móvil.
      const base = new URL(import.meta.env.BASE_URL + 'ocr/', location.href).href;
      const worker = await createWorker('spa', 1, {
        workerPath: base + 'worker.min.js',
        corePath: base,
        langPath: base,
        workerBlobURL: false,
        logger: (m) => {
          if (m.status === 'recognizing text') setStatus(`Leyendo el ticket… ${Math.round(m.progress * 100)} %`);
          else if (/loading|initializ/.test(m.status)) setStatus('Preparando el lector (la primera vez tarda un poco)…');
        },
      });
      try {
        const { data } = await worker.recognize(image);
        const guess = parseReceipt(data.text, today());
        if (guess.amountCents == null && guess.date == null) {
          setError('No he podido leer el ticket. Prueba con más luz y el ticket estirado, o escríbelo a mano.');
        } else {
          onResult(guess);
        }
      } finally {
        await worker.terminate();
      }
    } catch {
      setError('No se ha podido leer el ticket. Revisa la conexión la primera vez (descarga el lector) o escríbelo a mano.');
    } finally {
      setStatus(null);
      if (input.current) input.current.value = '';
    }
  }

  return (
    <div className="stack tight">
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
      <button type="button" className="secondary" onClick={() => input.current?.click()} disabled={status != null}>
        {status ?? '📷 Escanear ticket'}
      </button>
      {error && <p className="error small">{error}</p>}
    </div>
  );
}

/** Reduce la foto y la pasa a escala de grises: lee mejor y más rápido. */
async function prepare(file: File): Promise<HTMLCanvasElement | File> {
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, 2000 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    const ctx = canvas.getContext('2d')!;
    ctx.filter = 'grayscale(1) contrast(1.4)';
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    return canvas;
  } catch {
    return file;
  }
}
