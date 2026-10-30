# Guía rápida para trabajar en este repo

App web privada (PWA) para que una pareja apunte gastos comunes y lleve un presupuesto. React + TypeScript + Vite en el navegador, Supabase (Postgres con RLS, Realtime, Edge Function) detrás. Producción en Vercel, que despliega `main`. Qué hace cada sección: `README.md`.

## Dónde está cada cosa

- `src/App.tsx`: arranque, sesión, carga de datos y navegación por `#hash` (Inicio · Gastos · Compra · + · Presupuesto · Personal · Ajustes).
- `src/views/`: una pantalla o panel por archivo (`HomeView`, `ExpensesView`, `ExpenseForm`, `ShoppingView`, `BudgetView`, `PersonalView`, `SettingsView`…). Piezas comunes en `common.tsx` e iconos en `icons.tsx`. Las secciones (menos Inicio) y el formulario de gasto se cargan aparte desde `lazy.tsx` (con buena cobertura se bajan todas al entrar, `lib/lazyView.ts`): una sección nueva va ahí. Las partes de la lista de la compra van en `src/views/shopping/`; si un archivo pasa de ~600 líneas, partirlo igual.
- `src/lib/`: lógica sin interfaz, cada archivo con su `*.test.ts` al lado. Dinero en céntimos (`money.ts`), reparto (`split.ts`), saldo (`balance.ts`), presupuesto (`budget.ts`), fijos (`recurring.ts`), tickets (`ocr.ts`, `receipt.ts`, `pdfText.ts`), extracto del banco (`statement.ts`, `xlsx.ts`), exportar (`exportData.ts`, `xlsxWrite.ts`), compra (`shopping.ts`, `useShopping.ts`), historial de cambios (`history.ts`), retos de pareja (`challenges.ts`, tabla `challenges` de la `0016`), errores de la app (`errorLog.ts`, tabla `app_errors` de la `0015`), cola sin conexión (`expenseOutbox.ts`), datos del espacio (`useHousehold.ts`), tipos (`types.ts`), cliente Supabase (`supabase.ts`).
- `src/changelog.ts`: historial de versiones que la app enseña en Ajustes → Ver novedades.
- `supabase/migrations/`: esquema numerado `00NN_nombre.sql`. `supabase/tests/10_rls_test.sql`: pruebas de permisos (`scripts/test-db.sh`). Las copias semanales (`run_backup`, tabla `backups`) y el historial (`expense_changes`) están en `0014`; la 0014 también apunta las migraciones en `supabase_migrations.schema_migrations`: cada migración nueva debe añadir ahí su fila.
- `e2e/`: pruebas de pantallas con Playwright contra un Supabase de mentira (`fakeSupabase.ts`); `npm run test:screens`. Si una pantalla nueva lee una tabla nueva, añadirla a `sampleData()`.
- `supabase/functions/avisar/`: Edge Function de avisos push, Apple Pay y trabajo de cada mañana. Un solo archivo (se pega tal cual en Supabase); la lógica sin red va en funciones exportadas, probadas en `index.test.ts` con Vitest (`vite.config.ts` traduce sus `npm:`/`jsr:`). CI comprueba sus tipos con `deno check`.
- `scripts/copy-ocr.mjs`: copia el lector de tickets a `public/ocr` antes de `dev` y `build` (sin CDNs).

## Reglas del proyecto

- Todo lo que ve el usuario va en español, con tono cercano.
- Un fallo inesperado que se captura y se traga en silencio, mejor apuntarlo con `reportError` (`errorLog.ts`) para que salga en Ajustes → Errores de la app.
- Cada cambio en la app sube la versión en `package.json` y añade su entrada al principio de `src/changelog.ts` (`nuevo` / `mejora` / `correccion`); un test exige que coincidan. 1.X.0 funciones nuevas, 1.0.X correcciones, X.0.0 solo si lo pide el dueño. Cambios solo de documentación o de CI no suben versión.
- Migraciones: archivo nuevo en `supabase/migrations/` (nunca editar uno ya aplicado). Las aplica el dueño a mano en el SQL Editor de Supabase antes de fusionar la PR.
- Toda tabla nueva lleva RLS con `is_member(...)` (o solo el dueño en lo personal) y sus pruebas en `10_rls_test.sql`. Un espacio tiene como máximo 2 miembros.
- Nunca guardar claves en el repo.
- Antes de subir: `npm run lint`, `npm test`, `npm run build` y `npm run test:screens`. CI (`.github/workflows/ci.yml`) repite eso, `deno check` de la función y las pruebas de base de datos. Con CI en verde, se puede fusionar la PR (squash).

## Reparto del trabajo entre modelos

El Claude principal (Opus) planifica, decide la arquitectura, resuelve los fallos difíciles que cruzan varios archivos y revisa lo que hacen los demás. Delega la ejecución en los subagentes de `.claude/agents/`:

- `explorer` (Haiku, solo lectura): «¿dónde y cómo está hecho X?» y resúmenes de archivos largos.
- `implementer` (Sonnet): escribe el código de un plan ya claro: componentes, refactors acotados, migraciones y tests.
- `test-runner` (Haiku): pasa lint, tests, build y pruebas de pantallas y devuelve solo los fallos.
- `reviewer` (Sonnet; con `model: opus` si toca dinero, RLS, migraciones o borrados): revisa el diff antes del commit.

Flujo habitual: explorar → plan del principal → implementar → test-runner → reviewer → el principal decide, sube versión y hace commit. Para cambios pequeños (una línea, un texto) el principal puede hacerlo directamente sin delegar.
