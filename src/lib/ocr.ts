import { today } from './dates';
import { isPdf, readPdf } from './pdfText';
import { bestReading, parseReceipt, type ReceiptGuess } from './receipt';

/*
 * Lector de tickets en el propio móvil (Tesseract). La foto no se sube a ningún sitio ni se
 * guarda: se lee y se descarta. Todo se sirve desde la propia web (public/ocr).
 *
 * Una foto de un ticket arrugado, torcido o con lo de detrás transparentándose se lee
 * distinto según cómo se prepare. Antes de nada se recorta el papel: la mesa o la encimera de
 * alrededor, si tiene dibujo, se lee como letras y estropea cada línea. Primero se lee en grises; si la suma de los productos no
 * cuadra con el total, se vuelve a leer diciéndole al lector que es un ticket (un solo bloque de
 * líneas, sin columnas ni párrafos) y, si aún no cuadra, en blanco y negro puro. Se queda la mejor lectura.
 * Los tickets de un PDF hecho de imágenes (la app de Dia) son limpios, de pantalla: el blanco y
 * negro les estropea las letras finas, así que con ellos no se usa.
 */

/** Cada repaso: cómo se prepara la foto y si se le dice al lector que es un ticket. */
const PASSES = [
  { mode: 'grey', ticket: false, label: 'Leyendo el ticket' },
  { mode: 'grey', ticket: true, label: 'Repasando el ticket' },
  { mode: 'blackWhite', ticket: false, label: 'Repasando el ticket otra vez' },
] as const;

type Status = (text: string) => void;

export async function readReceipt(file: File | Blob, onStatus: Status): Promise<ReceiptGuess | null> {
  let fromPdf = false;
  if (file instanceof File && isPdf(file)) {
    onStatus('Abriendo el PDF…');
    const pdf = await readPdf(file);
    if ('text' in pdf) return parseReceipt(pdf.text, today());
    file = pdf.image;
    fromPdf = true;
  }
  onStatus('Preparando el lector…');
  const { createWorker, PSM } = await import('tesseract.js');
  const base = new URL(import.meta.env.BASE_URL + 'ocr/', location.href).href;
  let pass: string = PASSES[0].label;
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
    const box = paperBox(bitmap);
    for (const { mode, ticket, label } of PASSES) {
      if (fromPdf && mode === 'blackWhite') continue;
      pass = label;
      await worker.setParameters({ tessedit_pageseg_mode: ticket ? PSM.SINGLE_BLOCK : PSM.AUTO });
      const { data } = await worker.recognize(prepare(bitmap, box, mode));
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

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * Dónde está el ticket en la foto: el papel es claro y sin color, la mesa no. Se busca la franja
 * de columnas con más papel y, dentro, de la primera a la última fila con papel. Si no se ve
 * claro (fondo blanco, poca luz), se usa la foto entera.
 */
function paperBox(bitmap: ImageBitmap): Box {
  const whole = { x: 0, y: 0, w: bitmap.width, h: bitmap.height };
  const step = Math.max(1, Math.round(Math.max(bitmap.width, bitmap.height) / 320));
  const w = Math.max(1, Math.round(bitmap.width / step));
  const h = Math.max(1, Math.round(bitmap.height / step));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(bitmap, 0, 0, w, h);
  const p = ctx.getImageData(0, 0, w, h).data;
  const paper = new Uint8Array(w * h);
  const cols = new Float64Array(w);
  for (let i = 0; i < w * h; i++) {
    const max = Math.max(p[i * 4], p[i * 4 + 1], p[i * 4 + 2]);
    const min = Math.min(p[i * 4], p[i * 4 + 1], p[i * 4 + 2]);
    if (max > 140 && (max - min) / max < 0.12) {
      paper[i] = 1;
      cols[i % w] += 1 / h;
    }
  }
  let best = 0;
  for (let x = 1; x < w; x++) if (cols[x] > cols[best]) best = x;
  if (cols[best] < 0.3) return whole;
  let left = best;
  let right = best;
  while (left > 0 && cols[left - 1] > cols[best] * 0.25) left--;
  while (right < w - 1 && cols[right + 1] > cols[best] * 0.25) right++;
  const rows = new Float64Array(h);
  for (let y = 0; y < h; y++) for (let x = left; x <= right; x++) rows[y] += paper[y * w + x] / (right - left + 1);
  const top = Math.max(...rows) * 0.25;
  let first = 0;
  let last = h - 1;
  while (first < h - 1 && rows[first] <= top) first++;
  while (last > first && rows[last] <= top) last--;
  const pad = 2;
  const box = {
    x: Math.max(0, left - pad) * step,
    y: Math.max(0, first - pad) * step,
    w: (Math.min(w, right + 1 + pad) - Math.max(0, left - pad)) * step,
    h: (Math.min(h, last + 1 + pad) - Math.max(0, first - pad)) * step,
  };
  box.w = Math.min(box.w, bitmap.width - box.x);
  box.h = Math.min(box.h, bitmap.height - box.y);
  // Recortar solo merece la pena si se quita bastante fondo; un trozo minúsculo es un error.
  const share = (box.w * box.h) / (bitmap.width * bitmap.height);
  return share > 0.85 || share < 0.03 ? whole : box;
}

/** Tope de puntos de la imagen que se lee (los iPhone no dejan pintar mucho más grande). */
const MAX_PIXELS = 12_000_000;

/**
 * El ticket recortado, en escala de grises con más contraste y a buen tamaño (lo pequeño se amplía).
 * Un ticket muy largo y estrecho no se encoge por lo largo: se deja con letras de buen tamaño a lo ancho.
 */
function prepare(bitmap: ImageBitmap, box: Box, mode: 'grey' | 'blackWhite'): HTMLCanvasElement {
  let scale = Math.min(2, 3000 / Math.max(box.w, box.h));
  if (box.h > box.w * 3) scale = Math.min(2, Math.max(scale, 1600 / box.w));
  scale = Math.min(scale, Math.sqrt(MAX_PIXELS / (box.w * box.h)));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(box.w * scale);
  canvas.height = Math.round(box.h * scale);
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  ctx.filter = mode === 'grey' ? 'grayscale(1) contrast(1.4)' : 'grayscale(1)';
  ctx.drawImage(bitmap, box.x, box.y, box.w, box.h, 0, 0, canvas.width, canvas.height);
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
