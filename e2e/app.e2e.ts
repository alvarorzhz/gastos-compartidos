import { expect, test, type Page } from '@playwright/test';
import { ANA, BEA, openApp, sampleData } from './fakeSupabase';

/** Fallos de JavaScript en la página: cualquiera hace fallar la prueba. */
function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  return errors;
}

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
