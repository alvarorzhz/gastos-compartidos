import { today } from './dates';
import { bestReading, parseReceipt, type ReceiptGuess } from './receipt';

/*
 * Lector de tickets en el propio móvil (Tesseract). La foto no se sube a ningún sitio ni se
 * guarda: se lee y se descarta. Todo se sirve desde la propia web (public/ocr).
 *
 * Una foto de un ticket arrugado, torcido o con lo de detrás transparentándose se lee
 * distinto según cómo se prepare. Primero se lee en grises; si la suma de los productos no
 * cuadra con el total, se vuelve a leer en blanco y negro puro y se queda la mejor lectura.
 */

type Status = (text: string) => void;

export async function readReceipt(file: File, onStatus: Status): Promise<ReceiptGuess | null> {
  onStatus('Preparando el lector…');
  const { createWorker } = await import('tesseract.js');
  const base = new URL(import.meta.env.BASE_URL + 'ocr/', location.href).href;
  let pass = 'Leyendo el ticket';
  const worker = await createWorker('spa', 1, {
    workerPath: base + 'worker.min.js',
    corePath: base,
    langPath: base,
    workerBlobURL: false,
    logger: (m) => {
      if (m.status === 'recognizing text') onStatus(`${pass}… ${Math.round(m.progress * 100)} %`);
      else if (/loading|initializ/.test(m.status)) onStatus('Preparando el lector (la primera vez tarda un poco)…');
    },
  });
  try {
    const bitmap = await createImageBitmap(file).catch(() => null);
    if (!bitmap) {
      const { data } = await worker.recognize(file);
      return parseReceipt(data.text, today());
    }
    const readings: ReceiptGuess[] = [];
    for (const mode of ['grey', 'blackWhite'] as const) {
      if (mode === 'blackWhite') pass = 'Repasando el ticket';
      const { data } = await worker.recognize(prepare(bitmap, mode));
      const guess = parseReceipt(data.text, today());
      readings.push(guess);
      if (guess.linesMatchTotal) break;
    }
    bitmap.close();
    return bestReading(readings);
  } finally {
    await worker.terminate();
  }
}

/** Escala de grises con más contraste, a buen tamaño (las fotos pequeñas se amplían). */
function prepare(bitmap: ImageBitmap, mode: 'grey' | 'blackWhite'): HTMLCanvasElement {
  const scale = Math.min(2, 3000 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  ctx.filter = mode === 'grey' ? 'grayscale(1) contrast(1.4)' : 'grayscale(1)';
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  if (mode === 'blackWhite') threshold(ctx, canvas.width, canvas.height);
  return canvas;
}

/**
 * Blanco y negro según la luz de alrededor de cada punto: quita sombras, arrugas y el texto
 * de la otra cara que se transparenta, y deja las letras negras.
 */
function threshold(ctx: CanvasRenderingContext2D, w: number, h: number) {
  const img = ctx.getImageData(0, 0, w, h);
  const p = img.data;
  const sum = new Float64Array((w + 1) * (h + 1));
  for (let y = 0; y < h; y++) {
    let row = 0;
    for (let x = 0; x < w; x++) {
      row += p[(y * w + x) * 4];
      sum[(y + 1) * (w + 1) + x + 1] = sum[y * (w + 1) + x + 1] + row;
    }
  }
  const r = Math.max(8, Math.round(Math.min(w, h) / 30));
  for (let y = 0; y < h; y++) {
    const ya = Math.max(0, y - r);
    const yb = Math.min(h, y + r + 1);
    for (let x = 0; x < w; x++) {
      const xa = Math.max(0, x - r);
      const xb = Math.min(w, x + r + 1);
      const s = sum[yb * (w + 1) + xb] - sum[ya * (w + 1) + xb] - sum[yb * (w + 1) + xa] + sum[ya * (w + 1) + xa];
      const i = (y * w + x) * 4;
      const v = p[i] < (s / ((xb - xa) * (yb - ya))) * 0.88 ? 0 : 255;
      p[i] = p[i + 1] = p[i + 2] = v;
    }
  }
  ctx.putImageData(img, 0, 0);
}
