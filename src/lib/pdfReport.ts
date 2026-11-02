import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage, type RGB } from 'pdf-lib';
import { categoryStyle } from './categoryStyle';
import { formatMonth, formatShortDay } from './dates';
import { formatEuros } from './money';
import { changeText, type MonthReport } from './monthReport';

/*
 * Dibuja el resumen mensual como un PDF A4 con pdf-lib (sin servidores: se hace en el móvil).
 * Usa las fuentes estándar del PDF (Helvetica), así que no hay que descargar nada; a cambio,
 * solo admiten los caracteres de Europa occidental: los emojis y raros se quitan con clean().
 * Coordenadas: el PDF cuenta desde abajo; aquí se escribe con «y» desde arriba y top() lo traduce.
 */

const W = 595.28;
const H = 841.89;
const M = 40;
const CW = W - 2 * M;
const FOOT = 56;

const hex = (h: string): RGB => rgb(parseInt(h.slice(1, 3), 16) / 255, parseInt(h.slice(3, 5), 16) / 255, parseInt(h.slice(5, 7), 16) / 255);

// Los colores del tema «Jardín» (src/styles.css).
const C = {
  accent: hex('#3f6f4e'),
  accentSoft: hex('#e3eee4'),
  accentMuted: hex('#c9dccd'),
  text: hex('#1f2a22'),
  text2: hex('#566055'),
  text3: hex('#858c81'),
  border: hex('#e3e0d5'),
  surface2: hex('#f8f6f1'),
  track: hex('#ebe8df'),
  positive: hex('#1d7f47'),
  negative: hex('#b7472a'),
  warning: hex('#c98200'),
  white: rgb(1, 1, 1),
  headerSub: hex('#d5e6d9'),
};
const CAT = ['#3a78d6', '#5964d4', '#8a58e0', '#cf4e86', '#dc7428', '#b88700', '#17958a', '#1d8fbd', '#4f9a2a', '#6f7280', '#a2683b'].map(hex);

const roundEuros = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
const euros0 = (cents: number) => roundEuros.format(Math.round(cents / 100));

export async function buildReportPdf(r: MonthReport): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const allowed = new Set(regular.getCharacterSet());
  const clean = (s: string) =>
    [...s.replace(/\u2212/g, '-').replace(/[\u202f\u2009]/g, ' ').replace(/[\u2018\u2019]/g, "'")]
      .filter((ch) => allowed.has(ch.codePointAt(0)!))
      .join('')
      .replace(/\s+/g, ' ')
      .trim();

  const monthName = formatMonth(r.month).split(' ')[0];
  const monthLower = monthName.toLowerCase();
  const year = r.month.slice(0, 4);
  const prevName = formatMonth(r.history[r.history.length - 2]?.month ?? r.month).split(' ')[0].toLowerCase();
  const title = `Resumen de ${monthLower} ${year}`;

  doc.setTitle(`${title} · ${clean(r.householdName)}`);
  doc.setAuthor('Gastos compartidos');
  doc.setCreator('Gastos compartidos');
  doc.setProducer('Gastos compartidos');
  doc.setLanguage('es-ES');

  const pages: PDFPage[] = [];
  let page!: PDFPage;
  let y = 0;
  const top = (yy: number) => H - yy;

  function newPage() {
    page = doc.addPage([W, H]);
    pages.push(page);
    y = 48;
  }
  function need(h: number) {
    if (y + h > H - FOOT) newPage();
  }

  function text(s: string, x: number, yy: number, o: { size?: number; font?: PDFFont; color?: RGB; align?: 'left' | 'right' | 'center'; maxWidth?: number } = {}) {
    const size = o.size ?? 10;
    const font = o.font ?? regular;
    let t = clean(s);
    if (o.maxWidth != null && font.widthOfTextAtSize(t, size) > o.maxWidth) {
      while (t.length > 1 && font.widthOfTextAtSize(t + '…', size) > o.maxWidth) t = t.slice(0, -1);
      t = t.trimEnd() + '…';
    }
    const w = font.widthOfTextAtSize(t, size);
    const xx = o.align === 'right' ? x - w : o.align === 'center' ? x - w / 2 : x;
    page.drawText(t, { x: xx, y: top(yy), size, font, color: o.color ?? C.text });
    return w;
  }

  /** Párrafo que salta de línea solo; devuelve la altura usada. */
  function paragraph(s: string, x: number, yy: number, width: number, o: { size?: number; font?: PDFFont; color?: RGB; lineHeight?: number } = {}) {
    const size = o.size ?? 10;
    const font = o.font ?? regular;
    const lh = o.lineHeight ?? size * 1.45;
    const words = clean(s).split(' ');
    let line = '';
    let n = 0;
    for (const w of words) {
      const next = line ? `${line} ${w}` : w;
      if (font.widthOfTextAtSize(next, size) > width && line) {
        page.drawText(line, { x, y: top(yy + n * lh), size, font, color: o.color ?? C.text });
        n++;
        line = w;
      } else line = next;
    }
    if (line) {
      page.drawText(line, { x, y: top(yy + n * lh), size, font, color: o.color ?? C.text });
      n++;
    }
    return n * lh;
  }

  function roundRect(x: number, yy: number, w: number, h: number, rad: number, o: { color?: RGB; border?: RGB; opacity?: number }) {
    const r = Math.min(rad, w / 2, h / 2);
    const path = `M ${r} 0 H ${w - r} Q ${w} 0 ${w} ${r} V ${h - r} Q ${w} ${h} ${w - r} ${h} H ${r} Q 0 ${h} 0 ${h - r} V ${r} Q 0 0 ${r} 0 Z`;
    page.drawSvgPath(path, {
      x,
      y: top(yy),
      color: o.color,
      borderColor: o.border,
      borderWidth: o.border ? 0.8 : 0,
      opacity: o.opacity,
      borderOpacity: o.opacity,
    });
  }

  function bar(x: number, yy: number, w: number, h: number, ratio: number, color: RGB) {
    roundRect(x, yy, w, h, h / 2, { color: C.track });
    const fill = Math.max(0, Math.min(1, ratio)) * w;
    if (fill > 0.5) roundRect(x, yy, Math.max(fill, h), h, h / 2, { color });
  }

  /** Título de sección; `keep` es lo que viene detrás y no debe quedarse solo en otra página. */
  function sectionTitle(s: string, sub?: string, keep = 40) {
    need((sub ? 60 : 44) + keep);
    y += 10;
    text(s, M, y + 14, { size: 15, font: bold });
    y += 22;
    if (sub) {
      y += paragraph(sub, M, y + 8, CW, { size: 9.5, color: C.text2 });
      y += 2;
    }
    y += 6;
  }

  const catColor = (name: string) => CAT[(categoryStyle(name).tone - 1) % CAT.length];

  // ---------- Cabecera ----------
  newPage();
  page.drawRectangle({ x: 0, y: top(160), width: W, height: 160, color: C.accent });
  page.drawCircle({ x: W - 70, y: top(30), size: 90, color: C.white, opacity: 0.07 });
  page.drawCircle({ x: W - 150, y: top(150), size: 46, color: C.white, opacity: 0.06 });
  text(`GASTOS COMPARTIDOS  ·  ${r.householdName.toUpperCase()}`, M, 46, { size: 8.5, font: bold, color: C.headerSub, maxWidth: CW - 60 });
  text(`Resumen de ${monthLower}`, M, 90, { size: 30, font: bold, color: C.white });
  text(year, M, 116, { size: 16, color: C.headerSub });
  const genDay = formatShortDay(r.generatedOn, '0000-00-00');
  text(
    r.inProgress ? `Mes en curso: datos hasta el ${genDay}` : `${r.count} ${r.count === 1 ? 'gasto' : 'gastos'}  ·  hecho el ${genDay}`,
    M,
    140,
    { size: 9.5, color: C.headerSub },
  );
  y = 182;

  // ---------- Cifras grandes ----------
  const gap = 12;
  const cardW = (CW - 2 * gap) / 3;
  const cardH = 86;
  const ratio = r.budgetCents > 0 ? r.budgetedSpentCents / r.budgetCents : 0;
  const status = r.budgetCents <= 0 ? null : ratio > 1 ? C.negative : ratio >= 0.85 ? C.warning : C.positive;
  // Con el mes a medias se compara con el anterior hasta el mismo día, no con el mes entero.
  const prevCompare = r.inProgress ? r.previousToDateCents : r.previousSpentCents;
  const vsPrev = changeText(r.spentCents, prevCompare);
  const cards: { label: string; value: string; color?: RGB; sub: string[] }[] = [
    {
      label: 'GASTADO',
      value: formatEuros(r.spentCents),
      sub: [`${r.count} ${r.count === 1 ? 'gasto' : 'gastos'}`, r.fixedCents > 0 ? `${formatEuros(r.fixedCents)} en fijos` : 'sin gastos fijos'],
    },
    r.budgetCents > 0
      ? {
          label: 'PRESUPUESTO',
          value: `${Math.round(ratio * 100)} % usado`,
          color: status ?? undefined,
          sub: [
            `de ${formatEuros(r.budgetCents)}`,
            r.budgetCents - r.budgetedSpentCents >= 0
              ? `${r.inProgress ? 'quedan' : 'sobraron'} ${formatEuros(r.budgetCents - r.budgetedSpentCents)}`
              : `os pasasteis ${formatEuros(r.budgetedSpentCents - r.budgetCents)}`,
          ],
        }
      : { label: 'PRESUPUESTO', value: 'Sin poner', color: C.text3, sub: ['Ponedlo en la app,', 'en Presupuesto'] },
    vsPrev
      ? {
          label: `FRENTE A ${prevName.toUpperCase()}`,
          value: vsPrev,
          color: vsPrev === 'igual' ? C.text : r.spentCents > prevCompare ? C.negative : C.positive,
          sub: r.inProgress
            ? [`${formatEuros(prevCompare)} a estas alturas`, `${formatEuros(r.previousSpentCents)} el mes entero`]
            : [`${formatEuros(r.previousSpentCents)} en ${prevName}`, r.spentCents > r.previousSpentCents ? 'habéis gastado más' : 'habéis gastado menos'],
        }
      : {
          label: `FRENTE A ${prevName.toUpperCase()}`,
          value: 'Sin datos',
          color: C.text3,
          sub: r.inProgress ? [`${prevName.charAt(0).toUpperCase() + prevName.slice(1)} a estas alturas`, 'no tenía gastos'] : [`No hay gastos de ${prevName}`, 'para comparar'],
        },
  ];
  cards.forEach((c, i) => {
    const x = M + i * (cardW + gap);
    roundRect(x, y, cardW, cardH, 10, { color: C.surface2, border: C.border });
    text(c.label, x + 14, y + 22, { size: 7.5, font: bold, color: C.text3, maxWidth: cardW - 28 });
    text(c.value, x + 14, y + 46, { size: 18, font: bold, color: c.color ?? C.text, maxWidth: cardW - 28 });
    c.sub.forEach((s, k) => text(s, x + 14, y + 62 + k * 12, { size: 8.5, color: C.text2, maxWidth: cardW - 28 }));
  });
  y += cardH + 18;

  if (r.budgetCents > 0 && status) {
    text('Presupuesto usado', M, y + 8, { size: 9, font: bold, color: C.text2 });
    text(`${formatEuros(r.budgetedSpentCents)} de ${formatEuros(r.budgetCents)}`, M + CW, y + 8, { size: 9, color: C.text2, align: 'right' });
    bar(M, y + 15, CW, 9, ratio, status);
    y += 32;
    if (r.spentCents > r.budgetedSpentCents) {
      text(`Otros ${formatEuros(r.spentCents - r.budgetedSpentCents)} son de categorías sin presupuesto y no cuentan para el límite.`, M, y + 4, { size: 8.5, color: C.text3 });
      y += 14;
    }
  }

  // ---------- Categorías ----------
  if (r.categories.length === 0) {
    sectionTitle('En qué se fue');
    text(`En ${monthLower} no apuntasteis ningún gasto común.`, M, y + 10, { size: 10, color: C.text2 });
    y += 24;
  } else {
    const compared = r.averageMonths > 0 ? `Cada categoría con lo de ${prevName} y la media de los ${r.averageMonths === 1 ? 'mes anterior' : `${r.averageMonths} meses anteriores`}.` : '';
    sectionTitle('En qué se fue', r.inProgress && compared ? `${compared} Ojo: este mes aún no ha acabado y se compara con meses enteros.` : compared || undefined, 50);
    const colAmount = M + 330;
    const colShare = M + 372;
    const colPrev = M + 440;
    const colAvg = M + CW;
    const header = (yy: number) => {
      text('CATEGORÍA', M, yy, { size: 7, font: bold, color: C.text3 });
      text('GASTADO', colAmount, yy, { size: 7, font: bold, color: C.text3, align: 'right' });
      text('%', colShare, yy, { size: 7, font: bold, color: C.text3, align: 'right' });
      text(`VS ${prevName.toUpperCase()}`, colPrev, yy, { size: 7, font: bold, color: C.text3, align: 'right' });
      text('VS MEDIA', colAvg, yy, { size: 7, font: bold, color: C.text3, align: 'right' });
    };
    header(y + 4);
    y += 12;
    const maxCents = r.categories[0].cents;
    const shown = r.categories.length > 14 ? r.categories.slice(0, 13) : r.categories;
    const rest = r.categories.slice(shown.length);
    const delta = (now: number, before: number, x: number, yy: number) => {
      const t = changeText(now, before);
      text(t ?? '—', x, yy, { size: 9, font: t && t !== 'igual' ? bold : regular, color: !t || t === 'igual' ? C.text3 : now > before ? C.negative : C.positive, align: 'right' });
    };
    for (const c of shown) {
      need(36);
      const col = catColor(c.name);
      page.drawCircle({ x: M + 5, y: top(y + 13), size: 4.5, color: col });
      const nameW = text(c.name, M + 16, y + 16, { size: 10.5, font: bold, maxWidth: 180 });
      if (c.budgetCents != null) {
        const over = c.cents - c.budgetCents;
        text(over > 0 ? `${formatEuros(over)} sobre el límite` : `límite ${euros0(c.budgetCents)}`, M + 22 + nameW, y + 16, {
          size: 8,
          color: over > 0 ? C.negative : C.text3,
          font: over > 0 ? bold : regular,
          maxWidth: colAmount - 80 - (M + 22 + nameW),
        });
      }
      text(formatEuros(c.cents), colAmount, y + 16, { size: 10, font: bold, align: 'right' });
      text(`${Math.round(c.share * 100)} %`, colShare, y + 16, { size: 9, color: C.text2, align: 'right' });
      delta(c.cents, c.previousCents, colPrev, y + 16);
      delta(c.cents, c.averageCents, colAvg, y + 16);
      bar(M + 16, y + 22, colAmount - 70 - M - 16, 5, c.cents / maxCents, col);
      y += 34;
    }
    if (rest.length) {
      need(24);
      const cents = rest.reduce((s, c) => s + c.cents, 0);
      text(`Otras ${rest.length} categorías`, M + 16, y + 12, { size: 10, color: C.text2 });
      text(formatEuros(cents), colAmount, y + 12, { size: 10, font: bold, align: 'right' });
      y += 24;
    }
  }

  // ---------- Evolución ----------
  sectionTitle('Evolución', evolutionText(r, monthLower, prevName), 190);
  {
    const chartH = 130;
    const base = y + chartH + 20;
    const max = Math.max(1, ...r.history.map((h) => h.spentCents), r.averageCents);
    const slot = CW / r.history.length;
    const bw = Math.min(46, slot * 0.55);
    page.drawLine({ start: { x: M, y: top(base) }, end: { x: M + CW, y: top(base) }, thickness: 0.8, color: C.border });
    if (r.averageMonths >= 2) {
      const ay = base - (r.averageCents / max) * chartH;
      page.drawLine({ start: { x: M, y: top(ay) }, end: { x: M + CW, y: top(ay) }, thickness: 1.1, color: C.warning, dashArray: [4, 3] });
    }
    r.history.forEach((h, i) => {
      const cx = M + slot * i + slot / 2;
      const isThis = i === r.history.length - 1;
      const bh = (h.spentCents / max) * chartH;
      if (bh > 0) roundRect(cx - bw / 2, base - bh, bw, bh, Math.min(6, bh / 2), { color: isThis ? C.accent : C.accentMuted });
      // Fondo blanco bajo la cifra para que la línea de la media no la tache.
      const label = h.spentCents > 0 ? euros0(h.spentCents) : '—';
      const lw = (isThis ? bold : regular).widthOfTextAtSize(clean(label), 8.5);
      page.drawRectangle({ x: cx - lw / 2 - 3, y: top(base - bh - 3), width: lw + 6, height: 12, color: C.white });
      text(label, cx, base - bh - 6, { size: 8.5, font: isThis ? bold : regular, color: isThis ? C.text : C.text2, align: 'center' });
      const m = formatMonth(h.month).split(' ')[0].slice(0, 3).toLowerCase();
      text(isThis && r.inProgress ? `${m} (en curso)` : m, cx, base + 13, { size: 8.5, font: isThis ? bold : regular, color: isThis ? C.text : C.text3, align: 'center' });
    });
    y = base + 22;
    if (r.averageMonths >= 2) {
      page.drawLine({ start: { x: M, y: top(y + 5) }, end: { x: M + 16, y: top(y + 5) }, thickness: 1.1, color: C.warning, dashArray: [4, 3] });
      text(`Media de los ${r.averageMonths} meses anteriores: ${formatEuros(r.averageCents)}`, M + 22, y + 8, { size: 8, color: C.text3 });
      y += 16;
    }
  }

  // ---------- Saldo ----------
  if (r.people.length > 1) {
    sectionTitle('Quién pagó y saldo', 'Lo que adelantó cada uno este mes y lo que le tocaba según el reparto de cada gasto.', 130);
    const pw = (CW - gap) / 2;
    r.people.slice(0, 2).forEach((p, i) => {
      const x = M + i * (pw + gap);
      roundRect(x, y, pw, 64, 10, { color: C.surface2, border: C.border });
      text(p.name, x + 14, y + 20, { size: 11, font: bold, maxWidth: pw - 28 });
      text('Pagó', x + 14, y + 38, { size: 8.5, color: C.text3 });
      text(formatEuros(p.paidCents), x + 14, y + 53, { size: 12, font: bold });
      text('Le tocaba', x + pw / 2, y + 38, { size: 8.5, color: C.text3 });
      text(formatEuros(p.shareCents), x + pw / 2, y + 53, { size: 12, font: bold, color: C.text2 });
    });
    y += 76;
    roundRect(M, y, CW, 40, 10, { color: C.accentSoft });
    const when = r.inProgress ? 'Hoy' : `Al acabar ${monthLower}`;
    const sentence = r.balance ? `${when}, ${r.balance.from} debe ${formatEuros(r.balance.cents)} a ${r.balance.to}.` : `${when} estabais en paz: nadie debía nada.`;
    text(sentence, M + 14, y + 18, { size: 11, font: bold, color: C.accent, maxWidth: CW - 28 });
    text(
      r.settledCents > 0 ? `Contando los reembolsos de ese mes (${formatEuros(r.settledCents)}) y lo que venía de antes.` : 'Contando lo que venía de meses anteriores.',
      M + 14,
      y + 31,
      { size: 8.5, color: C.text2, maxWidth: CW - 28 },
    );
    y += 52;
  }

  // ---------- Gastos más grandes ----------
  if (r.top.length > 0) {
    sectionTitle('Los gastos más grandes', undefined, 30);
    for (const [i, e] of r.top.entries()) {
      need(28);
      if (i > 0) page.drawLine({ start: { x: M, y: top(y) }, end: { x: M + CW, y: top(y) }, thickness: 0.5, color: C.border });
      text(formatShortDay(e.date, e.date), M, y + 17, { size: 9, color: C.text3 });
      text(e.note, M + 52, y + 17, { size: 10, font: bold, maxWidth: 210 });
      text(e.category, M + 270, y + 17, { size: 9, color: C.text2, maxWidth: 110 });
      if (r.people.length > 1) text(`pagó ${e.payer}`, M + 385, y + 17, { size: 9, color: C.text3, maxWidth: 70 });
      text(formatEuros(e.cents), M + CW, y + 17, { size: 10, font: bold, align: 'right' });
      y += 26;
    }
  }

  // ---------- Pie de cada página ----------
  pages.forEach((p, i) => {
    page = p;
    page.drawLine({ start: { x: M, y: 38 }, end: { x: W - M, y: 38 }, thickness: 0.5, color: C.border });
    page.drawText(clean(`Gastos compartidos  ·  ${title}`), { x: M, y: 24, size: 8, font: regular, color: C.text3 });
    const right = `Página ${i + 1} de ${pages.length}`;
    page.drawText(right, { x: W - M - regular.widthOfTextAtSize(right, 8), y: 24, size: 8, font: regular, color: C.text3 });
  });

  return doc.save();
}

/** Frase de la evolución: frente al mes anterior y a la media. */
export function evolutionText(r: MonthReport, monthLower: string, prevName: string): string {
  const parts: string[] = [];
  const before = r.inProgress ? r.previousToDateCents : r.previousSpentCents;
  const when = r.inProgress ? `a estas alturas de ${prevName}` : `en ${prevName}`;
  const vsPrev = changeText(r.spentCents, before);
  if (vsPrev) parts.push(vsPrev === 'igual' ? `lo mismo que ${when}` : `${vsPrev} que ${when} (${formatEuros(before)})`);
  if (r.averageMonths >= 2 && !r.inProgress) {
    const vsAvg = changeText(r.spentCents, r.averageCents);
    if (vsAvg) parts.push(vsAvg === 'igual' ? `justo la media de los ${r.averageMonths} meses anteriores` : `${vsAvg} que la media de los ${r.averageMonths} meses anteriores (${formatEuros(r.averageCents)})`);
  }
  const head = `En ${monthLower} ${r.inProgress ? 'lleváis' : 'gastasteis'} ${formatEuros(r.spentCents)}`;
  const tail = r.inProgress ? ' El mes aún no ha acabado, así que la comparación irá cambiando.' : '';
  if (parts.length) return `${head}: ${parts.join(' y ')}.${tail}`;
  return r.inProgress ? `${head}. Aún es pronto para compararlo con ${prevName}.${tail}` : `${head}. Aún no hay meses anteriores con los que comparar.`;
}
