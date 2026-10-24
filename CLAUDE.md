# Guía rápida para trabajar en este repo

App web privada (PWA) para que una pareja apunte gastos comunes y lleve un presupuesto. React + TypeScript + Vite en el navegador, Supabase (Postgres con RLS, Realtime, Edge Function) detrás. Producción en Vercel, que despliega `main`. Qué hace cada sección: `README.md`.

## Dónde está cada cosa

- `src/App.tsx`: arranque, sesión, carga de datos y navegación por `#hash` (Inicio · Gastos · Compra · + · Presupuesto · Personal · Ajustes).
- `src/views/`: una pantalla o panel por archivo (`HomeView`, `ExpensesView`, `ExpenseForm`, `ShoppingView`, `BudgetView`, `PersonalView`, `SettingsView`…). Piezas comunes en `common.tsx` e iconos en `icons.tsx`.
- `src/lib/`: lógica sin interfaz, cada archivo con su `*.test.ts` al lado. Dinero en céntimos (`money.ts`), reparto (`split.ts`), saldo (`balance.ts`), presupuesto (`budget.ts`), fijos (`recurring.ts`), tickets (`ocr.ts`, `receipt.ts`, `pdfText.ts`), extracto del banco (`statement.ts`, `xlsx.ts`), exportar (`exportData.ts`, `xlsxWrite.ts`), compra (`shopping.ts`, `useShopping.ts`), datos del espacio (`useHousehold.ts`), tipos (`types.ts`), cliente Supabase (`supabase.ts`).
- `src/changelog.ts`: historial de versiones que la app enseña en Ajustes → Ver novedades.
- `supabase/migrations/`: esquema numerado `00NN_nombre.sql`. `supabase/tests/10_rls_test.sql`: pruebas de permisos (`scripts/test-db.sh`).
- `supabase/functions/avisar/`: Edge Function de avisos push, Apple Pay y trabajo de cada mañana.
- `scripts/copy-ocr.mjs`: copia el lector de tickets a `public/ocr` antes de `dev` y `build` (sin CDNs).

## Reglas del proyecto

- Todo lo que ve el usuario va en español, con tono cercano.
- Cada cambio en la app sube la versión en `package.json` y añade su entrada al principio de `src/changelog.ts` (`nuevo` / `mejora` / `correccion`); un test exige que coincidan. 1.X.0 funciones nuevas, 1.0.X correcciones, X.0.0 solo si lo pide el dueño. Cambios solo de documentación o de CI no suben versión.
- Migraciones: archivo nuevo en `supabase/migrations/` (nunca editar uno ya aplicado). Las aplica el dueño a mano en el SQL Editor de Supabase antes de fusionar la PR.
- Toda tabla nueva lleva RLS con `is_member(...)` (o solo el dueño en lo personal) y sus pruebas en `10_rls_test.sql`. Un espacio tiene como máximo 2 miembros.
- Nunca guardar claves en el repo.
- Antes de subir: `npm test` y `npm run build`. CI (`.github/workflows/ci.yml`) repite eso y las pruebas de base de datos. Con CI en verde, se puede fusionar la PR (squash).
