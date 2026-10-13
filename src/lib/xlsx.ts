/**
 * Lector mínimo de Excel (.xlsx) para importar extractos del banco.
 * Un .xlsx es un zip con XML dentro: se descomprime con DecompressionStream (navegador y Node)
 * y se lee la primera hoja como una tabla de textos. Todo ocurre en el dispositivo.
 */

/** Filas de la primera hoja. Las celdas vacías son ''. Los números se devuelven tal cual ("-8.98"). */
export async function readXlsx(buffer: ArrayBuffer): Promise<string[][]> {
  const files = listZip(new Uint8Array(buffer));
  const text = async (name: string) => {
    const entry = files.get(name);
    return entry ? new TextDecoder().decode(await entry()) : null;
  };
  const shared = parseSharedStrings((await text('xl/sharedStrings.xml')) ?? '');
  const sheet = (await text(await firstSheetPath(text))) ?? (await text('xl/worksheets/sheet1.xml'));
  if (sheet == null) throw new Error('El archivo no tiene ninguna hoja');
  return parseSheet(sheet, shared);
}

async function firstSheetPath(text: (name: string) => Promise<string | null>): Promise<string> {
  const workbook = (await text('xl/workbook.xml')) ?? '';
  const rels = (await text('xl/_rels/workbook.xml.rels')) ?? '';
  const id = /<sheet\b[^>]*\br:id="([^"]+)"/.exec(workbook)?.[1];
  const rel = id && [...rels.matchAll(/<Relationship\b[^>]*>/g)].map((m) => m[0]).find((r) => attr(r, 'Id') === id);
  const target = rel ? attr(rel, 'Target') : null;
  if (!target) return 'xl/worksheets/sheet1.xml';
  return target.startsWith('/') ? target.slice(1) : 'xl/' + target;
}

type Entry = () => Promise<Uint8Array>;

/** Índice del zip: nombre → función que devuelve el contenido descomprimido. */
function listZip(bytes: Uint8Array): Map<string, Entry> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let eocd = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i--) {
    if (view.getUint32(i, true) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error('No es un archivo Excel (.xlsx)');
  const count = view.getUint16(eocd + 10, true);
  let p = view.getUint32(eocd + 16, true);
  const out = new Map<string, Entry>();
  for (let n = 0; n < count; n++) {
    if (view.getUint32(p, true) !== 0x02014b50) break;
    const method = view.getUint16(p + 10, true);
    const size = view.getUint32(p + 20, true);
    const nameLen = view.getUint16(p + 28, true);
    const extraLen = view.getUint16(p + 30, true);
    const commentLen = view.getUint16(p + 32, true);
    const local = view.getUint32(p + 42, true);
    const name = new TextDecoder().decode(bytes.subarray(p + 46, p + 46 + nameLen));
    p += 46 + nameLen + extraLen + commentLen;
    out.set(name, async () => {
      const start = local + 30 + view.getUint16(local + 26, true) + view.getUint16(local + 28, true);
      const data = bytes.subarray(start, start + size);
      if (method === 0) return data;
      if (method !== 8) throw new Error('Formato de compresión no soportado');
      return inflate(data);
    });
  }
  return out;
}

async function inflate(data: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([data as BlobPart]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

function attr(tag: string, name: string): string | null {
  return new RegExp(`\\s${name}="([^"]*)"`).exec(tag)?.[1] ?? null;
}

function decodeXml(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (_, e: string) => {
    if (e[0] === '#') return String.fromCodePoint(e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : Number(e.slice(1)));
    return ({ amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" } as Record<string, string>)[e.toLowerCase()];
  });
}

/** Junta todos los trozos <t> (el texto con formato viene partido en varios). */
function textOf(xml: string): string {
  return [...xml.matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)].map((m) => decodeXml(m[1])).join('');
}

function parseSharedStrings(xml: string): string[] {
  return [...xml.matchAll(/<si\b[^>]*>([\s\S]*?)<\/si>/g)].map((m) => textOf(m[1]));
}

/** "B12" → 1 */
function columnIndex(ref: string): number {
  let n = 0;
  for (const ch of ref.replace(/\d+$/, '')) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

function parseSheet(xml: string, shared: string[]): string[][] {
  const rows: string[][] = [];
  for (const row of xml.matchAll(/<row\b([^>]*?)(?:\/>|>([\s\S]*?)<\/row>)/g)) {
    const r = Number(attr(row[1], 'r')) || rows.length + 1;
    while (rows.length < r - 1) rows.push([]);
    const cells: string[] = [];
    for (const cell of (row[2] ?? '').matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const ref = attr(cell[1], 'r');
      const col = ref ? columnIndex(ref) : cells.length;
      const type = attr(cell[1], 't');
      const body = cell[2] ?? '';
      const v = /<v>([\s\S]*?)<\/v>/.exec(body)?.[1];
      let value = '';
      if (type === 's') value = shared[Number(v)] ?? '';
      else if (type === 'inlineStr') value = textOf(body);
      else if (v != null) value = decodeXml(v);
      while (cells.length < col) cells.push('');
      cells[col] = value;
    }
    rows.push(cells);
  }
  return rows;
}
