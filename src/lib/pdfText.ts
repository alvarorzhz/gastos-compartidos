/*
 * Tickets en PDF (los que mandan por correo o guarda la app de la tienda). Casi siempre llevan
 * el texto dentro: se saca tal cual, sin leer ninguna foto, y sale perfecto. Si el PDF es una
 * foto escaneada, se pinta la primera página como imagen para leerla como una foto más.
 * Todo se hace en el móvil y el lector de PDF se sirve desde la propia web (la versión
 * "legacy", que funciona también en iPhones con Safari no tan nuevo).
 */

export interface PdfTextItem {
  str: string;
  /** Posición del principio del trozo (puntos del PDF; la y crece hacia arriba). */
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Rehace las líneas del ticket con los trozos de texto del PDF: los que están a la misma altura
 * forman una línea, de izquierda a derecha, con un espacio donde había hueco entre ellos.
 */
export function pdfTextLines(items: PdfTextItem[]): string[] {
  const rows: { y: number; height: number; items: PdfTextItem[] }[] = [];
  for (const item of items) {
    if (!item.str.trim()) continue;
    const row = rows.find((r) => Math.abs(r.y - item.y) <= Math.max(r.height, item.height, 1) / 2);
    if (row) row.items.push(item);
    else rows.push({ y: item.y, height: item.height, items: [item] });
  }
  return rows
    .sort((a, b) => b.y - a.y)
    .map((row) => {
      const parts = row.items.sort((a, b) => a.x - b.x);
      let line = '';
      let end = -Infinity;
      for (const p of parts) {
        const charWidth = p.width / Math.max(1, p.str.length) || p.height / 2;
        if (line && p.x - end > charWidth * 0.5 && !/\s$/.test(line) && !/^\s/.test(p.str)) line += ' ';
        line += p.str;
        end = p.x + p.width;
      }
      return line.replace(/\s+/g, ' ').trim();
    })
    .filter(Boolean);
}

export const isPdf = (file: File) => file.type === 'application/pdf' || /\.pdf$/i.test(file.name);

/**
 * El texto del PDF, o, si no lleva texto (un escaneo), la primera página como imagen para
 * leerla con el lector de fotos.
 */
export async function readPdf(file: File): Promise<{ text: string } | { image: Blob }> {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const { default: workerSrc } = await import('pdfjs-dist/legacy/build/pdf.worker.min.mjs?url');
  pdfjs.GlobalWorkerOptions.workerSrc = workerSrc;
  const task = pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) });
  try {
    const doc = await task.promise;
    const lines: string[] = [];
    for (let n = 1; n <= Math.min(doc.numPages, 5); n++) {
      const content = await (await doc.getPage(n)).getTextContent();
      const items: PdfTextItem[] = [];
      for (const it of content.items) {
        if (!('str' in it)) continue;
        items.push({ str: it.str, x: it.transform[4], y: it.transform[5], width: it.width, height: it.height || Math.abs(it.transform[3]) });
      }
      lines.push(...pdfTextLines(items));
    }
    const text = lines.join('\n');
    if (text.replace(/[^a-zA-Z0-9]/g, '').length >= 20) return { text };
    // Sin texto: es un escaneo. La primera página como imagen, a buen tamaño.
    const page = await doc.getPage(1);
    const base = page.getViewport({ scale: 1 });
    const viewport = page.getViewport({ scale: Math.min(4, 2400 / Math.max(base.width, base.height)) });
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(viewport.width);
    canvas.height = Math.round(viewport.height);
    await page.render({ canvas, viewport }).promise;
    const image = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
    if (!image) throw new Error('No se ha podido abrir el PDF');
    return { image };
  } finally {
    await task.destroy();
  }
}
