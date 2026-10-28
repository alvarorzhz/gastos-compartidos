import { expect, test, type Page } from '@playwright/test';
import { ANA, BEA, openApp } from './fakeSupabase';

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
