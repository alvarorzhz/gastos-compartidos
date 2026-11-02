import { PDFDocument } from 'pdf-lib';
import { describe, expect, it } from 'vitest';
import { changeText, monthReport, reportFileName } from './monthReport';
import { buildReportPdf, evolutionText } from './pdfReport';
import type { Category, Expense, Settlement } from './types';
import type { HouseholdData } from './useHousehold';

const cat = (id: string, name = id): Category => ({ id, household_id: 'h', name, archived: false, alert_percent: 90 });
let n = 0;
const exp = (category_id: string, spent_on: string, amount_cents: number, paid_by = 'a', note: string | null = null, recurring_id: string | null = null): Expense => ({
  id: String(++n), household_id: 'h', amount_cents, spent_on, category_id, paid_by,
  owed_cents: null, note, recurring_id, created_by: paid_by, created_at: '', updated_at: '',
});
const settle = (amount_cents: number, paid_on: string, from_user: string, to_user: string): Settlement => ({
  id: String(++n), household_id: 'h', amount_cents, paid_on, from_user, to_user, note: null, created_by: from_user, created_at: '',
});

function sample(): HouseholdData {
  return {
    household: { id: 'h', name: 'Casa 🏡', currency: 'EUR', default_split_user: null, default_split_percent: null },
    members: [
      { household_id: 'h', user_id: 'a', display_name: 'Álvaro' },
      { household_id: 'h', user_id: 'b', display_name: 'Patri' },
    ],
    categories: [cat('super', 'Supermercado'), cat('ocio', 'Ocio'), cat('casa', 'Casa')],
    expenses: [
      exp('super', '2026-10-03', 30000, 'a', 'Mercadona'),
      exp('ocio', '2026-10-10', 8000, 'b', 'Cine ✨'),
      exp('casa', '2026-10-01', 70000, 'a', 'Alquiler', 'r1'),
      exp('super', '2026-09-03', 25000),
      exp('super', '2026-08-03', 35000, 'b'),
      exp('super', '2026-11-01', 9999),
    ],
    budgets: [
      { household_id: 'h', category_id: 'ocio', month: '2026-09-01', amount_cents: 5000 },
      { household_id: 'h', category_id: 'super', month: '2026-09-01', amount_cents: 40000 },
    ],
    settlements: [settle(10000, '2026-10-20', 'b', 'a'), settle(5000, '2026-11-01', 'b', 'a')],
  } as unknown as HouseholdData;
}

describe('monthReport', () => {
  it('resume el mes con categorías, comparaciones, quién pagó y saldo al cerrar', () => {
    const r = monthReport(sample(), '2026-10-01', '2026-11-02');
    expect(r.inProgress).toBe(false);
    expect(r.spentCents).toBe(108000);
    expect(r.count).toBe(3);
    expect(r.fixedCents).toBe(70000);
    expect(r.budgetCents).toBe(45000);
    expect(r.budgetedSpentCents).toBe(38000);
    expect(r.previousSpentCents).toBe(25000);
    // Media de agosto (350) y septiembre (250); los meses sin gastos no cuentan.
    expect(r.averageMonths).toBe(2);
    expect(r.averageCents).toBe(30000);
    expect(r.history.map((h) => h.spentCents)).toEqual([0, 0, 0, 35000, 25000, 108000]);
    expect(r.categories.map((c) => c.name)).toEqual(['Casa', 'Supermercado', 'Ocio']);
    expect(r.categories[1]).toMatchObject({ cents: 30000, previousCents: 25000, averageCents: 30000, budgetCents: 40000 });
    expect(r.top[0]).toMatchObject({ note: 'Alquiler', cents: 70000, payer: 'Álvaro' });
    expect(r.people).toEqual([
      { name: 'Álvaro', paidCents: 100000, shareCents: 54000 },
      { name: 'Patri', paidCents: 8000, shareCents: 54000 },
    ]);
    expect(r.settledCents).toBe(10000);
    // Agosto: Patri pagó 350 → Álvaro le debe 175. Sept: Álvaro 250 → −125. Oct: +500 − 40. Reembolso de 100.
    // Patri debe a Álvaro: −175 + 125 + 500 − 40 − 100 = 310 €. El reembolso de noviembre no cuenta.
    expect(r.balance).toEqual({ from: 'Patri', to: 'Álvaro', cents: 31000 });
  });

  it('el mes en curso cuenta hasta hoy y sin pareja no hay saldo', () => {
    const data = sample();
    data.members = data.members.slice(0, 1);
    const r = monthReport(data, '2026-11-01', '2026-11-02');
    expect(r.inProgress).toBe(true);
    expect(r.people).toEqual([]);
    expect(r.balance).toBeNull();
    expect(r.categories).toHaveLength(1);
  });

  it('compara con texto corto', () => {
    expect(changeText(120, 100)).toBe('+20 %');
    expect(changeText(80, 100)).toBe('−20 %');
    expect(changeText(100, 100)).toBe('igual');
    expect(changeText(100, 0)).toBeNull();
    expect(reportFileName('2026-10-01')).toBe('resumen-2026-10.pdf');
  });

  it('explica la evolución frente al mes anterior y la media', () => {
    const r = monthReport(sample(), '2026-10-01', '2026-11-02');
    expect(evolutionText(r, 'octubre', 'septiembre').replace(/\s/g, ' ')).toBe(
      'En octubre gastasteis 1080,00 €: +332 % que en septiembre (250,00 €) y +260 % que la media de los 2 meses anteriores (300,00 €).',
    );
  });
});

describe('buildReportPdf', () => {
  it('hace un PDF válido aunque haya emojis y muchas categorías', async () => {
    const data = sample();
    for (let i = 0; i < 20; i++) {
      data.categories.push(cat('x' + i, `Categoría ${i} 🎉`));
      data.expenses.push(exp('x' + i, '2026-10-05', 1000 + i, 'b', 'Algo − raro'));
    }
    const bytes = await buildReportPdf(monthReport(data, '2026-10-01', '2026-11-02'));
    expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe('%PDF-');
    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBeGreaterThanOrEqual(1);
    expect(doc.getTitle()).toContain('Resumen de octubre 2026');
  });

  it('también sin ningún gasto', async () => {
    const data = sample();
    data.expenses = [];
    data.settlements = [];
    const bytes = await buildReportPdf(monthReport(data, '2026-10-01', '2026-11-02'));
    expect((await PDFDocument.load(bytes)).getPageCount()).toBeLessThanOrEqual(2);
  });
});
