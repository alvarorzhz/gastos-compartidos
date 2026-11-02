import { expect, test, type Page } from '@playwright/test';
import { ANA, BEA, openApp, sampleData } from './fakeSupabase';

/** Fallos de JavaScript en la página: cualquiera hace fallar la prueba. */
function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  return errors;
}

// En todas las pruebas: nada puede quedar bloqueado por las cabeceras de seguridad (vercel.json).
const blocked = new WeakMap<Page, string[]>();
test.beforeEach(({ page }) => {
  const list: string[] = [];
  blocked.set(page, list);
  page.on('console', (m) => {
    if (/Content Security Policy/i.test(m.text())) list.push(m.text());
  });
});
test.afterEach(({ page }) => {
  expect(blocked.get(page) ?? []).toEqual([]);
});

const tabs = (page: Page) => page.getByRole('navigation', { name: 'Secciones' });

test('sin sesión se ve la pantalla para entrar', async ({ page }) => {
  const errors = watchErrors(page);
  await openApp(page, { loggedIn: false });
  await expect(page.getByPlaceholder('nombre@ejemplo.com')).toBeVisible();
  expect(errors).toEqual([]);
});

test('todas las secciones se abren sin fallos', async ({ page }) => {
  const errors = watchErrors(page);
  await openApp(page);
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Ana');

  for (const [tab, heading] of [
    ['Gastos', 'Gastos'],
    ['Compra', 'Lista de la compra'],
    ['Presupuesto', 'Presupuesto'],
    ['Personal', 'Personal'],
    ['Ajustes', 'Ajustes'],
    ['Inicio', 'Ana'],
  ]) {
    await tabs(page).getByRole('button', { name: tab, exact: true }).click();
    await expect(page.getByRole('heading', { level: 1 })).toContainText(heading);
  }
  expect(errors).toEqual([]);
});

test('la web manda las cabeceras de seguridad de vercel.json', async ({ page }) => {
  const response = await page.goto('/');
  const headers = response?.headers() ?? {};
  expect(headers['content-security-policy']).toContain("frame-ancestors 'none'");
  expect(headers['content-security-policy']).toContain('connect-src');
  expect(headers['x-frame-options']).toBe('DENY');
  expect(headers['x-content-type-options']).toBe('nosniff');
});

test('Gastos enseña los movimientos y el saldo', async ({ page }) => {
  await openApp(page);
  await tabs(page).getByRole('button', { name: 'Gastos', exact: true }).click();
  await expect(page.getByText('Mercadona')).toBeVisible();
  await expect(page.getByText('Cine')).toBeVisible();
  await page.locator('label', { hasText: /^Saldo$/ }).click();
  await expect(page).toHaveURL(/#saldo/);
});

test('apuntar un gasto lo guarda y sale en la lista', async ({ page }) => {
  const fake = await openApp(page);
  await tabs(page).getByRole('button', { name: 'Añadir gasto' }).click();
  await page.getByLabel('Importe').fill('12,50');
  await page.getByLabel(/Concepto/).fill('Panadería');
  await page.getByRole('button', { name: 'Guardar gasto' }).click();

  await expect.poll(() => fake.writes.find((w) => w.what === 'POST expenses')?.body).toMatchObject({ amount_cents: 1250, note: 'Panadería' });
  await tabs(page).getByRole('button', { name: 'Gastos', exact: true }).click();
  await expect(page.getByText('Panadería')).toBeVisible();
});

test('un gasto todo de la pareja se guarda entero para ella', async ({ page }) => {
  const fake = await openApp(page);
  await tabs(page).getByRole('button', { name: 'Añadir gasto' }).click();
  await page.getByLabel('Importe').fill('20');
  await page.getByLabel(/Concepto/).fill('Regalo');
  await page.getByRole('button', { name: /Reparto/ }).click();
  await expect(page.getByRole('radio', { name: 'A medias' })).toBeChecked();
  await page.getByText('Todo de Bea').click();
  await expect(page.getByText(/Es solo de Bea y lo pagas tú/)).toBeVisible();
  await page.getByRole('button', { name: 'Guardar gasto' }).click();

  await expect.poll(() => fake.writes.find((w) => w.what === 'POST expenses')?.body).toMatchObject({ amount_cents: 2000, paid_by: expect.any(String), owed_cents: 2000 });
});

test('añadir a la lista de la compra', async ({ page }) => {
  const fake = await openApp(page);
  await tabs(page).getByRole('button', { name: 'Compra', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Marcar Leche como comprado' })).toBeVisible();
  const input = page.getByPlaceholder(/Añadir/i);
  await input.fill('Tomates');
  await input.press('Enter');
  await expect.poll(() => fake.writes.some((w) => w.what === 'POST shopping_items')).toBe(true);
  await expect(page.getByRole('button', { name: 'Marcar Tomates como comprado' })).toBeVisible();
});

test('Ajustes: historial de cambios, recuperar un borrado y copias', async ({ page }) => {
  const fake = await openApp(page);
  await tabs(page).getByRole('button', { name: 'Ajustes', exact: true }).click();
  await page.getByRole('button', { name: /Tus datos/ }).click();

  const history = page.getByRole('region', { name: 'Historial de cambios' });
  await expect(history.getByText(/Bea borró 18,00\s€ · Farmacia/)).toBeVisible();
  await expect(history.getByText(/Tú apuntaste 54,20\s€ · Mercadona/)).toBeVisible();
  await history.getByRole('button', { name: 'Recuperar' }).click();
  await expect.poll(() => fake.writes.find((w) => w.what === 'rpc restore_expense')?.body).toEqual({ p_change_id: 2 });
  await expect(page.getByText('Gasto recuperado')).toBeVisible();
  await expect(history.getByRole('button', { name: 'Recuperar' })).toHaveCount(0);

  const backups = page.getByRole('region', { name: 'Copias de seguridad' });
  await expect(backups.getByText('Lo común, de los dos')).toBeVisible();
  const download = page.waitForEvent('download');
  await backups.getByRole('button', { name: /Lo común/ }).click();
  expect((await download).suggestedFilename()).toMatch(/^copia-comun-\d{4}-\d{2}-\d{2}\.json$/);
});

test('saldar: anotar lo que os habéis pasado deja el saldo en paz', async ({ page }) => {
  const fake = await openApp(page);
  await tabs(page).getByRole('button', { name: 'Gastos', exact: true }).click();
  await page.locator('label', { hasText: /^Saldo$/ }).click();
  const hero = page.getByRole('region', { name: 'Saldo entre los dos' });
  // Ana pagó 54,20 € y Bea 30,00 €: Bea le pasa 12,10 €.
  await expect(hero).toContainText(/Bea te pasa\s*12,10\s€/);
  await hero.getByRole('button', { name: /Ya nos lo hemos pasado/ }).click();
  await page.getByRole('button', { name: 'Guardar', exact: true }).click();
  await expect.poll(() => fake.writes.find((w) => w.what === 'POST settlements')?.body).toMatchObject({ amount_cents: 1210, from_user: BEA, to_user: ANA });
  await expect(hero).toContainText('Estáis en paz');
});

test('presupuesto: poner un límite a una categoría', async ({ page }) => {
  const fake = await openApp(page);
  await tabs(page).getByRole('button', { name: 'Presupuesto', exact: true }).click();
  await page.getByRole('button', { name: /^Supermercado: .*sin presupuesto/ }).click();
  await page.getByLabel('Límite al mes').fill('300');
  await page.getByRole('button', { name: 'Guardar', exact: true }).click();
  await expect.poll(() => fake.writes.find((w) => w.what.endsWith(' budgets'))?.body).toMatchObject({ amount_cents: 30000, category_id: 'c-super' });
  await expect(page.getByRole('button', { name: /^Supermercado: 54,20\s€ de 300,00\s€/ })).toBeVisible();
});

test('viajes: crear uno nuevo', async ({ page }) => {
  const fake = await openApp(page);
  await tabs(page).getByRole('button', { name: 'Gastos', exact: true }).click();
  await page.getByRole('button', { name: /Viajes/ }).click();
  await page.getByRole('button', { name: /Nuevo viaje o evento/ }).click();
  await page.getByPlaceholder(/Roma, Boda/).fill('Roma');
  await page.getByRole('button', { name: 'Guardar', exact: true }).click();
  await expect.poll(() => fake.writes.find((w) => w.what === 'POST events')?.body).toMatchObject({ name: 'Roma' });
  await expect(page.getByText('Roma').first()).toBeVisible();
});

test('personal: un gasto propio no sale en los comunes', async ({ page }) => {
  const fake = await openApp(page);
  await tabs(page).getByRole('button', { name: 'Personal', exact: true }).click();
  await page.getByRole('button', { name: 'Gasto', exact: true }).click();
  await page.getByLabel('Importe').fill('9,99');
  await page.getByLabel(/Concepto|Nota/).fill('Gimnasio');
  await page.getByRole('button', { name: 'Guardar', exact: true }).click();
  await expect.poll(() => fake.writes.find((w) => w.what === 'POST personal_entries')?.body).toMatchObject({ amount_cents: 999, kind: 'expense' });
  await expect(page.getByText('Gimnasio')).toBeVisible();
  await tabs(page).getByRole('button', { name: 'Gastos', exact: true }).click();
  await expect(page.getByText('Mercadona')).toBeVisible();
  await expect(page.getByText('Gimnasio')).toHaveCount(0);
});

test('compra: terminar la compra apunta el gasto', async ({ page }) => {
  const fake = await openApp(page);
  await tabs(page).getByRole('button', { name: 'Compra', exact: true }).click();
  await page.getByRole('button', { name: 'Marcar Leche como comprado' }).click();
  await page.getByRole('button', { name: /^Terminar/ }).first().click();
  await page.getByLabel('Total de la compra').fill('3,40');
  await page.getByRole('button', { name: 'Apuntar gasto y terminar' }).click();
  await expect.poll(() => fake.writes.find((w) => w.what === 'POST expenses')?.body).toMatchObject({ amount_cents: 340 });
});

test('sin conexión: el gasto se queda pendiente y se sube al volver', async ({ page }) => {
  const fake = await openApp(page);
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Ana');
  fake.offline = true;
  await tabs(page).getByRole('button', { name: 'Añadir gasto' }).click();
  await page.getByLabel('Importe').fill('4,20');
  await page.getByLabel(/Concepto/).fill('Churros');
  await page.getByRole('button', { name: 'Guardar gasto' }).click();
  await tabs(page).getByRole('button', { name: 'Gastos', exact: true }).click();
  await expect(page.getByText('Churros')).toBeVisible();
  await expect(page.getByText(/sin subir|pendiente de subir/i).first()).toBeVisible();
  expect(fake.tables.expenses.some((e) => e.note === 'Churros')).toBe(false);

  fake.offline = false;
  await page.evaluate(() => window.dispatchEvent(new Event('online')));
  await expect.poll(() => fake.tables.expenses.some((e) => e.note === 'Churros'), { timeout: 10_000 }).toBe(true);
});

test('Ajustes: errores de la app, verlos, borrarlos y apuntar uno nuevo', async ({ page }) => {
  const fake = await openApp(page);
  await tabs(page).getByRole('button', { name: 'Ajustes', exact: true }).click();
  await page.getByRole('button', { name: /Tus datos/ }).click();
  const errors = page.getByRole('region', { name: 'Errores de la app' });
  await expect(errors.getByText(/reading 'id'/)).toBeVisible();
  await expect(errors.getByText(/Bea · gastos · versión 3\.15\.0/)).toBeVisible();
  await errors.getByRole('button', { name: /reading 'id'/ }).click();
  await expect(errors.getByText('iPhone de Bea')).toBeVisible();

  await errors.getByRole('button', { name: 'Borrar la lista' }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Borrar' }).click();
  await expect.poll(() => fake.writes.some((w) => w.what === 'DELETE app_errors')).toBe(true);
  await expect(errors.getByText(/Ningún error/)).toBeVisible();

  // Un fallo que nadie captura se apunta solo.
  await page.evaluate(() => setTimeout(() => { throw new Error('Fallo de prueba'); }));
  await expect.poll(() => fake.writes.find((w) => w.what === 'POST app_errors')?.body).toMatchObject([{ message: 'Fallo de prueba', place: 'ajustes' }]);
});

/** PDF sencillo con texto (como el ticket de la app de la tienda): cada fila, sus trozos en columnas. */
function ticketPdf(rows: string[][]): Buffer {
  const text = rows.flatMap((parts, row) => parts.map((p, i) => `BT /F1 10 Tf ${20 + i * 200} ${780 - row * 14} Td (${p}) Tj ET`)).join('\n');
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    `<< /Length ${text.length} >>\nstream\n${text}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];
  let pdf = '%PDF-1.4\n';
  const offsets: number[] = [];
  objects.forEach((o, i) => {
    offsets.push(pdf.length);
    pdf += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const xref = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}`;
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(pdf, 'latin1');
}

const leclercTicket = () => ticketPdf([
  ['E.Leclerc'], ['Caja 005-0160 2026-10-27 18:43'], ['TOTAL', 'IVA'],
  ['LECHE ENTERA 1L', '0.89', '1'], ['ANACARDO TOST 0% SAL', '2.99', '2'],
  ['Total 2 Articulos', '3.88'], ['Tarjeta', '3.88'], ['IMPORTE:', '3,88 EUR'],
]);

test('compra: el ticket guarda el precio de lo de la lista y añade lo nuevo', async ({ page }) => {
  const fake = await openApp(page);
  await tabs(page).getByRole('button', { name: 'Compra', exact: true }).click();
  await page.getByRole('button', { name: 'Marcar Leche como comprado' }).click();
  await page.getByRole('button', { name: /^Terminar/ }).first().click();
  const pdf = leclercTicket();
  await page.locator('input[type=file][accept*="pdf"]').setInputFiles({ name: 'ticket.pdf', mimeType: 'application/pdf', buffer: pdf });
  await expect(page.getByLabel('Total de la compra')).toHaveValue('3,88');
  await expect(page.getByLabel('Precio de Leche')).toHaveValue('0,89');
  await expect(page.getByLabel('Nombre de Anacardo tost 0% sal')).toHaveValue('Anacardo tost 0% sal');
  if (process.env.CAPTURAS) await page.locator('.stack-sm', { has: page.locator('.finish-prices') }).screenshot({ path: `${process.env.CAPTURAS}/1-terminar-compra.png` });
  await page.getByRole('button', { name: 'Apuntar gasto y terminar' }).click();
  await expect.poll(() => fake.writes.find((w) => w.what === 'POST shopping_items')?.body).toEqual([
    expect.objectContaining({ name: 'Anacardo tost 0% sal', price_cents: 299, status: 'bought', ticket_name: 'ANACARDO TOST 0% SAL' }),
  ]);
  await expect.poll(() => fake.writes.some((w) => w.what === 'PATCH shopping_items' && (w.body as { price_cents?: number })?.price_cents === 89)).toBe(true);
});

test('nuevo gasto: el ticket del súper guarda sus productos en la compra', async ({ page }) => {
  const fake = await openApp(page);
  await tabs(page).getByRole('button', { name: 'Añadir gasto' }).click();
  await page.locator('input[type=file][accept*="pdf"]').setInputFiles({ name: 'ticket.pdf', mimeType: 'application/pdf', buffer: leclercTicket() });
  await expect(page.getByLabel('Importe')).toHaveValue('3,88');
  await expect(page.getByRole('checkbox', { name: 'Guardar los productos en la compra (2)' })).toBeChecked();
  await expect(page.getByRole('checkbox', { name: 'Guardar Leche' })).toBeChecked();
  await expect(page.getByLabel('Nombre de Anacardo tost 0% sal')).toHaveValue('Anacardo tost 0% sal');
  if (process.env.CAPTURAS) await page.locator('.card', { hasText: 'Guardar los productos' }).screenshot({ path: `${process.env.CAPTURAS}/2-nuevo-gasto.png` });
  await page.getByRole('button', { name: 'Guardar gasto' }).click();
  await expect.poll(() => fake.writes.find((w) => w.what === 'POST shopping_items')?.body).toEqual([
    expect.objectContaining({ name: 'Anacardo tost 0% sal', price_cents: 299, status: 'bought' }),
  ]);
  await expect.poll(() => fake.writes.find((w) => w.what === 'PATCH shopping_items')?.body).toMatchObject({ status: 'bought', price_cents: 89 });
});

test('Inicio: un gasto apuntado dos veces se une en uno', async ({ page }) => {
  const tables = sampleData();
  const first = tables.expenses[0];
  tables.expenses.push({ ...first, id: 'e-dup', note: 'MERCADONA VALENCIA', paid_by: BEA, created_by: BEA });
  const fake = await openApp(page, { tables });
  const card = page.getByRole('region', { name: '¿Es el mismo gasto?' });
  await expect(card).toBeVisible();
  await expect(card.getByText(/Los dos habéis apuntado 54,20/)).toBeVisible();
  if (process.env.CAPTURAS) await card.screenshot({ path: `${process.env.CAPTURAS}/1-repetidos.png` });
  await card.getByRole('button', { name: 'Unir en uno' }).click();
  await expect(card).toBeHidden();
  await expect.poll(() => fake.writes.some((w) => w.what === 'DELETE expenses'), { timeout: 10_000 }).toBe(true);
});

test('Presupuesto: propone límites según los últimos 3 meses', async ({ page }) => {
  const tables = sampleData();
  const now = new Date();
  for (const [back, cents] of [[1, 31000], [2, 29500], [3, 33000]]) {
    const spent = new Date(now.getFullYear(), now.getMonth() - back, 10);
    const spent_on = `${spent.getFullYear()}-${String(spent.getMonth() + 1).padStart(2, '0')}-10`;
    tables.expenses.push({ ...tables.expenses[0], id: `e-old-${back}`, amount_cents: cents, spent_on, note: 'Súper' });
  }
  // La historia del mes pasado ya vista, para que no tape la pantalla.
  const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const seen = `${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, '0')}-01`;
  await page.addInitScript((m) => localStorage.setItem('gastos.cierreVisto', m), seen);
  const fake = await openApp(page, { tables });
  await tabs(page).getByRole('button', { name: 'Presupuesto', exact: true }).click();
  const card = page.getByRole('region', { name: 'Límites a vuestra medida' });
  await expect(card.getByText('Supermercado')).toBeVisible();
  await expect(card.getByText('310,00 €', { exact: true })).toBeVisible();
  if (process.env.CAPTURAS) await card.screenshot({ path: `${process.env.CAPTURAS}/2-limites.png` });
  await card.getByRole('button', { name: 'Poner' }).click();
  await expect.poll(() => fake.writes.find((w) => w.what === 'POST budgets')?.body).toEqual([
    expect.objectContaining({ category_id: 'c-super', amount_cents: 31000 }),
  ]);
});

test('Inicio: proponer un reto de pareja', async ({ page }) => {
  const fake = await openApp(page);
  const card = page.getByRole('region', { name: 'Retos de pareja' });
  await card.getByRole('button', { name: 'Proponer un reto' }).click();
  const sheet = page.getByRole('dialog', { name: 'Proponer un reto' });
  await expect(sheet.getByText('Una semana sin gastos de Ocio')).toBeVisible();
  if (process.env.CAPTURAS) await sheet.screenshot({ path: `${process.env.CAPTURAS}/1-proponer.png` });
  await sheet.getByRole('listitem').filter({ hasText: 'Una semana sin gastos de Ocio' }).getByRole('button', { name: 'Proponer' }).click();
  await expect.poll(() => fake.writes.find((w) => w.what === 'POST challenges')?.body).toMatchObject({ kind: 'without', category_id: 'c-ocio', title: 'Una semana sin gastos de Ocio' });
  await expect(card.getByText('Esperando a que Bea lo acepte')).toBeVisible();
});

test('Inicio: aceptar el reto que propone la pareja y ver cómo vais', async ({ page }) => {
  const tables = sampleData();
  const now = new Date();
  const first = new Date(now.getFullYear(), now.getMonth(), 1);
  const last = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  tables.challenges.push({
    id: 'reto-1', household_id: tables.households[0].id, kind: 'cap', title: 'Este mes, Supermercado por debajo de 300,00 €', category_id: 'c-super',
    keyword: null, goal_id: null, amount_cents: 30000, starts_on: iso(first), ends_on: iso(last), proposed_by: BEA, accepted_at: null, created_at: now.toISOString(),
  });
  const fake = await openApp(page, { tables });
  const card = page.getByRole('region', { name: 'Retos de pareja' });
  await expect(card.getByText('Bea te propone un reto')).toBeVisible();
  await card.getByRole('button', { name: 'Aceptar' }).click();
  await expect.poll(() => fake.writes.find((w) => w.what === 'PATCH challenges')?.body).toMatchObject({ accepted_at: expect.any(String) });
  await expect(card.getByText(/Lleváis 54,20\s€ de 300,00\s€/)).toBeVisible();
  await expect(card.getByRole('progressbar', { name: 'Límite del reto usado' })).toBeVisible();
  if (process.env.CAPTURAS) {
    await expect(page.getByText(/Reto aceptado/)).toBeHidden({ timeout: 10_000 });
    await card.screenshot({ path: `${process.env.CAPTURAS}/2-en-marcha.png` });
  }
});

test('personal: el coach pone nota, calcula el colchón y compara con tu mes normal', async ({ page }) => {
  const errors = watchErrors(page);
  await page.clock.setFixedTime(new Date('2026-10-20T10:00:00'));
  const tables = sampleData();
  let n = 0;
  const entry = (kind: string, amount_cents: number, entry_on: string, category: string) => ({
    id: `p-${++n}`, user_id: ANA, kind, amount_cents, entry_on, category, note: null, recurring_id: null, created_at: '2026-01-01T00:00:00Z',
  });
  for (const m of ['2026-05', '2026-06', '2026-07', '2026-08', '2026-09']) {
    tables.personal_entries.push(entry('income', 200000, `${m}-01`, 'Nómina'), entry('expense', 120000, `${m}-10`, 'Supermercado'));
  }
  tables.personal_entries.push(entry('income', 200000, '2026-10-01', 'Nómina'), entry('expense', 60000, '2026-10-05', 'Supermercado'), entry('expense', 25000, '2026-10-12', 'Comida fuera'));
  tables.personal_budgets.push({ user_id: ANA, category: 'Comida fuera', amount_cents: 15000, updated_at: '2026-01-01T00:00:00Z' });
  await openApp(page, { tables });
  await tabs(page).getByRole('button', { name: 'Personal', exact: true }).click();

  await expect(page.getByRole('heading', { name: 'Tu coach' })).toBeVisible();
  await expect(page.getByRole('img', { name: /Nota del mes: \d+ de 100/ })).toBeVisible();
  await expect(page.getByText(/Te has pasado 100,00\s€ en Comida fuera/)).toBeVisible();
  // 5 meses × 800 € que sobraron = 4.000 €; gastas 1.200 € al mes → 3,3 meses.
  await expect(page.getByText('3,3 meses').first()).toBeVisible();
  await expect(page.getByText('Comparado con tu mes normal')).toBeVisible();
  await page.getByRole('heading', { name: 'Tu coach' }).scrollIntoViewIfNeeded();
  await page.getByRole('region', { name: 'Tu coach' }).screenshot({ path: 'test-results/coach.png' });
  expect(errors).toEqual([]);
});

test('Gastos → Calendario: el mes día a día y los gastos del día que se toca', async ({ page }) => {
  const errors = watchErrors(page);
  await openApp(page);
  await tabs(page).getByRole('button', { name: 'Gastos', exact: true }).click();
  await page.locator('label', { hasText: /^Calendario$/ }).click();
  await expect(page).toHaveURL(/#calendario/);
  const calendar = page.getByRole('region', { name: 'Calendario de gastos' });
  await expect(calendar).toBeVisible();
  await calendar.getByRole('button', { name: /54,20\s€ en 1 gasto/ }).click();
  await expect(page.getByRole('listitem').filter({ hasText: 'Mercadona' })).toBeVisible();
  expect(errors).toEqual([]);
});

test('Deseos: apuntar un capricho, votar y que salga el elegido', async ({ page }) => {
  const errors = watchErrors(page);
  const tables = sampleData();
  tables.wishes.push({ id: 'w-1', household_id: tables.households[0].id, kind: 'treat', name: 'Tarde de spa', price_cents: 9000, note: null, created_by: BEA, done_at: null, goal_id: null, created_at: '2026-11-01T10:00:00Z' });
  tables.wish_votes.push({ wish_id: 'w-1', household_id: tables.households[0].id, user_id: BEA, score: 3, updated_at: '2026-11-01T10:00:00Z' });
  const fake = await openApp(page, { tables });

  // En Inicio, el widget avisa de que falta tu voto.
  await expect(page.getByRole('button', { name: /Caprichos/ })).toContainText('espera tu voto');
  await page.getByRole('button', { name: /Caprichos/ }).click();
  await expect(page).toHaveURL(/#deseos/);
  await expect(page.getByText('Falta tu voto')).toBeVisible();
  await page.getByRole('group', { name: /Tarde de spa/ }).getByRole('button', { name: '¡Me apetece muchísimo!' }).click();
  await expect.poll(() => fake.writes.find((w) => w.what === 'POST wish_votes')?.body).toMatchObject({ wish_id: 'w-1', user_id: ANA, score: 3 });
  const chosen = page.getByRole('region', { name: 'El capricho elegido' });
  await expect(chosen).toContainText('Tarde de spa');

  await page.getByRole('button', { name: 'Añadir capricho' }).click();
  const sheet = page.getByRole('dialog', { name: 'Añadir capricho' });
  await sheet.getByLabel('¿Qué os apetece?').fill('Cena en el japonés');
  await sheet.getByLabel(/Precio/).fill('60');
  await sheet.getByRole('button', { name: 'Guardar' }).click();
  await expect.poll(() => fake.writes.find((w) => w.what === 'POST wishes')?.body).toMatchObject({ kind: 'treat', name: 'Cena en el japonés', price_cents: 6000 });
  await expect(page.getByText('Cena en el japonés')).toBeVisible();

  await chosen.getByRole('button', { name: 'Ya nos lo dimos' }).click();
  await expect.poll(() => fake.writes.find((w) => w.what === 'PATCH wishes')?.body).toMatchObject({ done_at: expect.any(String) });
  expect(errors).toEqual([]);
});

test('Presupuesto: descargar el resumen del mes en PDF', async ({ page }) => {
  const errors = watchErrors(page);
  await openApp(page);
  await tabs(page).getByRole('button', { name: 'Presupuesto', exact: true }).click();
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Resumen en PDF' }).click()]);
  expect(download.suggestedFilename()).toMatch(/^resumen-\d{4}-\d{2}\.pdf$/);
  const chunks: Buffer[] = [];
  for await (const c of (await download.createReadStream())!) chunks.push(c as Buffer);
  expect(Buffer.concat(chunks).subarray(0, 5).toString()).toBe('%PDF-');
  await expect(page.getByText('Resumen en PDF listo')).toBeVisible();
  // También desde Ajustes → Tus datos, eligiendo el mes.
  await page.goto('/#ajustes');
  await page.getByRole('button', { name: /Tus datos/ }).click();
  await expect(page.getByLabel('Mes del resumen')).toBeVisible();
  if (process.env.CAPTURAS) await page.locator('.report-picker').screenshot({ path: `${process.env.CAPTURAS}/3-ajustes-pdf.png` });
  expect(errors).toEqual([]);
});

test('Inicio: la previsión dice de dónde sale y si hay pocos datos', async ({ page }) => {
  const errors = watchErrors(page);
  await page.clock.setFixedTime(new Date('2026-10-20T10:00:00'));
  const tables = sampleData();
  const base = tables.expenses[0];
  tables.expenses = [3, 5, 8, 11, 14, 17].map((d, i) => ({ ...base, id: `e-v${i}`, amount_cents: 3000 + i * 250, spent_on: `2026-10-${String(d).padStart(2, '0')}`, note: 'Súper' }));
  tables.expenses.push({ ...base, id: 'e-alq', amount_cents: 70000, spent_on: '2026-10-01', note: 'Alquiler', recurring_id: 'r-1' });
  await openApp(page, { tables });
  const forecast = page.locator('.forecast');
  await expect(forecast).toContainText('A este ritmo acabaréis el mes');
  await expect(forecast.getByText('Bastante fiable')).toBeVisible();
  await forecast.getByRole('button', { name: '¿De dónde sale?' }).click();
  await expect(forecast).toContainText('en 6 gastos durante 20 días');
  await expect(forecast).toContainText('Fijos ya apuntados');
  await expect(forecast).toContainText('Qué supone');
  if (process.env.CAPTURAS) await page.getByRole('region', { name: 'Gasto del mes' }).screenshot({ path: `${process.env.CAPTURAS}/4-prevision-inicio.png` });
  expect(errors).toEqual([]);
});

test('Personal: la tendencia explica con qué meses se calcula', async ({ page }) => {
  const errors = watchErrors(page);
  await page.clock.setFixedTime(new Date('2026-10-20T10:00:00'));
  const tables = sampleData();
  let n = 0;
  const entry = (kind: string, amount_cents: number, entry_on: string, category: string) => ({
    id: `p-${++n}`, user_id: ANA, kind, amount_cents, entry_on, category, note: null, recurring_id: null, created_at: '2026-01-01T00:00:00Z',
  });
  for (const [m, cents] of [['2026-07', 110000], ['2026-08', 125000], ['2026-09', 118000]] as const) {
    tables.personal_entries.push(entry('income', 200000, `${m}-01`, 'Nómina'), entry('expense', cents, `${m}-10`, 'Supermercado'));
  }
  await openApp(page, { tables });
  await tabs(page).getByRole('button', { name: 'Personal', exact: true }).click();
  const trend = page.getByRole('region', { name: 'Tendencia' });
  await expect(trend.getByText('Pocos datos todavía')).toBeVisible();
  await trend.getByRole('button', { name: '¿De dónde sale?' }).click();
  await expect(trend).toContainText('Tus 3 últimos meses completos, de julio de 2026 a septiembre de 2026');
  await expect(trend).toContainText('Solo hay 3 meses completos');
  if (process.env.CAPTURAS) await trend.screenshot({ path: `${process.env.CAPTURAS}/5-tendencia-personal.png` });
  expect(errors).toEqual([]);
});

test('nuevo gasto: lo dudoso del ticket sale en amarillo hasta tocarlo', async ({ page }) => {
  const errors = watchErrors(page);
  await openApp(page);
  await tabs(page).getByRole('button', { name: 'Añadir gasto' }).click();
  // Sin fecha y con un total que no cuadra con los productos.
  const pdf = ticketPdf([
    ['E.Leclerc'], ['TOTAL', 'IVA'],
    ['LECHE ENTERA 1L', '0.89', '1'], ['ANACARDO TOST 0% SAL', '2.99', '2'], ['JAMON SERRANO', '7.50', '2'],
    ['Total 3 Articulos', '12.88'], ['Tarjeta', '12.88'],
  ]);
  await page.locator('input[type=file][accept*="pdf"]').setInputFiles({ name: 'ticket.pdf', mimeType: 'application/pdf', buffer: pdf });
  await expect(page.getByLabel('Importe')).toHaveValue('12,88');
  await expect(page.getByText(/conviene mirar/)).toBeVisible();
  const totalDoubt = page.getByText(/Los productos suman 11,38\s€ y el total leído es 12,88\s€/);
  await expect(totalDoubt).toBeVisible();
  await expect(page.getByText(/No he leído la fecha/)).toBeVisible();
  await expect(page.locator('.ticket-item.doubtful')).toHaveCount(1);
  await expect(page.locator('.ticket-item.doubtful')).toContainText('Precio muy alto');
  if (process.env.CAPTURAS) await page.locator('.sheet-body, [role=dialog]').first().screenshot({ path: `${process.env.CAPTURAS}/2-ticket-dudoso.png` });
  await page.getByLabel('Importe').fill('11,38');
  await expect(totalDoubt).toBeHidden();
  expect(errors).toEqual([]);
});
