import { expect, test, type Page } from '@playwright/test';
import { openApp } from './fakeSupabase';

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
