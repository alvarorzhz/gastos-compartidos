# Gastos compartidos

App web privada, pensada para el móvil, para que dos personas apunten sus gastos comunes, vean quién debe a quién y comparen cada mes lo gastado con lo presupuestado. Versión actual: **3.11.0** (el historial completo está en [`src/changelog.ts`](src/changelog.ts) y en la app, **Ajustes → Ver novedades**).

En producción: <https://gastos-compartidos-eight.vercel.app>

## Qué hace

La barra de abajo tiene **Inicio · Gastos · Compra · + · Presupuesto · Personal · Ajustes**.

**Inicio**
- Cómo va el mes, el saldo entre los dos y la **previsión de fin de mes** (desde el día 5, contando los fijos que faltan).
- **Pagos por confirmar** que han llegado desde Apple Pay.
- **Historia del mes**: el mes contado en pantallas a pantalla completa, al estilo de los resúmenes de fin de año de la música. Sale el día 1 y se puede abrir los 10 primeros días del mes.

**Gastos**
- Importe, fecha, categoría, quién pagó y nota. Reparto 50/50 por defecto (o el del espacio, por ejemplo 60/40, en Ajustes); cada gasto puede tener otro porcentaje, un importe exacto o ser de una sola persona.
- **Saldo** y **reembolsos** (Bizum, transferencia…): solo se anotan, la app no mueve dinero.
- **Gastos fijos** semanales, mensuales o anuales, que se apuntan solos cada mañana. Si algo se repite cada mes, la app propone hacerlo fijo.
- **Viajes y eventos**: agrupan los gastos de unas fechas con su total y su saldo.
- **Buscador** por texto, importe y categoría, y **Deshacer** tras borrar.
- **Escanear tickets** con la cámara, desde una foto del carrete o desde el **PDF** de la tienda. Se lee en el propio móvil; la foto no se sube.
- La app **rellena sola** categoría, pagador y reparto según el concepto, y ofrece los **gastos habituales** con un toque.
- **Sin conexión** también se apunta: queda como «Sin subir» y se sube al volver la cobertura.

**Compra**
- **Lista de la compra compartida** en tiempo real: cantidades, pasillos, recientes, habituales e historial.
- **Terminar compra** (aunque falten cosas por marcar) con el ticket: se apunta como gasto común y la app recuerda el precio de cada producto.
- **Dónde sale más barato**: compara los precios de cada tienda de los últimos 6 meses.

**Presupuesto**
- Límite mensual por categoría, que se mantiene entre meses, con aviso al 80, 90 o 100 %.
- **Huchas** comunes (objetivos de ahorro), que se pueden archivar y recuperar.
- **Gráficos** de los últimos 12 meses, por categoría, por persona y fijos frente a variables.

**Personal** (solo lo ve quien lo apunta, ni la pareja)
- Gastos e ingresos propios, fijos personales e **importación del extracto del banco** (Excel de BBVA).
- **Límites por categoría** y **tendencia** con previsión de 3 meses.
- **Lo que se repite**: suscripciones con su coste al mes y al año, cobros duplicados, renovaciones anuales, gastos hormiga y un simulador de ahorro. **Ordenar «Otros»** propone la categoría que falta.

**Ajustes**
- Invitar a la pareja, nombre del espacio, reparto por defecto y categorías.
- **Contraseña** (necesaria en iPhone para entrar desde la app instalada; también se puede entrar con el enlace del correo).
- **Avisos en el móvil**: cuando la pareja apunta un gasto, cuando un presupuesto llega a su aviso, los fijos de cada mañana y los resúmenes de la semana (lunes) y del mes (día 1). En iPhone solo con la app instalada.
- **Apuntar al pagar con Apple Pay**: guía para crear el atajo de Cartera en el iPhone.
- **Instalar en el móvil**, **Lo que la app hace sola**, **Ver novedades**, exportar todo (Excel con una hoja por tabla, o JSON) y borrar el espacio o la cuenta.

Además: tiempo real entre los dos móviles, modo oscuro automático, se instala como app (PWA) y se abre sin conexión con los datos de la última vez. Moneda: EUR.

## Cómo está hecha

| Pieza | Elección | Por qué |
| --- | --- | --- |
| Interfaz | React + TypeScript + Vite | Web estática, rápida en móvil, se aloja gratis |
| Datos y login | [Supabase](https://supabase.com) (Postgres + Auth + Realtime) | Plan gratuito suficiente para dos personas; seguridad por filas (RLS) |
| Avisos y Apple Pay | Edge Function [`avisar`](supabase/functions/avisar/index.ts) | Manda las notificaciones push y recibe los pagos del atajo |
| Trabajo de cada mañana | `pg_cron` + `pg_net` en Supabase | Apunta fijos y manda avisos aunque nadie abra la app |
| Alojamiento | [Vercel](https://vercel.com) (plan gratuito) | Publica solo cada cambio que llega a `main` |
| Lector de tickets | [Tesseract](https://github.com/naptha/tesseract.js) y [pdf.js](https://mozilla.github.io/pdf.js/) | Se ejecutan en el móvil, sin servicios externos |

La lógica de permisos empieza en [`supabase/migrations/0001_init.sql`](supabase/migrations/0001_init.sql) y cada migración añade las políticas de sus tablas:

- Un **espacio** (`households`) tiene como máximo **dos miembros** y cada cuenta pertenece a un único espacio.
- Las políticas RLS hacen que cada consulta devuelva solo filas del espacio propio. Lo **personal** (movimientos, fijos y límites personales) solo lo ve su dueño.
- La segunda persona entra por **invitación a su email**. El email invitado se borra en cuanto acepta.
- Solo se guarda un nombre visible por persona; el email vive únicamente en el sistema de login de Supabase.

## Base de datos: migraciones

Cada archivo de [`supabase/migrations/`](supabase/migrations/) se ejecuta **una sola vez y en orden**. Todas están ya aplicadas en el proyecto de producción.

| Archivo | Qué añade | Versión |
| --- | --- | --- |
| `0001_init.sql` | Espacios, miembros, invitaciones, categorías, gastos, reembolsos, presupuestos y RLS | 1.0.0 |
| `0002_reparto_y_tiempo_real.sql` | Reparto por gasto (`owed_cents`) y tiempo real | 1.0.0 |
| `0003_fijos_y_avisos.sql` | Gastos fijos y avisos de presupuesto por categoría | 1.1.0 |
| `0004_personal.sql` | Movimientos personales (solo su dueño) | 1.3.0 |
| `0005_huchas_y_fijos_personales.sql` | Huchas comunes y fijos personales | 1.4.0 |
| `0006_reparto_por_defecto.sql` | Reparto por defecto del espacio | 2.2.0 |
| `0007_lista_compra.sql` | Lista de la compra compartida | 3.0.0 |
| `0008_viajes_y_avisos.sql` | Viajes y eventos, suscripciones y claves de los avisos push | 3.1.0 |
| `0009_compra_y_gastos.sql` | Compra enlazada al gasto y precios por producto | 3.2.0 |
| `0010_automatico.sql` | Trabajo de cada mañana con `pg_cron` y `pg_net` | 3.3.0 |
| `0011_presupuesto_personal.sql` | Límites mensuales personales | 3.6.0 |
| `0012_pagos_apple_pay.sql` | Pagos por confirmar desde Apple Pay y clave de cada persona | 3.9.0 |

## Puesta en marcha (desde cero)

1. **Crea un proyecto en Supabase** (plan Free, región UE, por ejemplo Frankfurt o París).
2. En **SQL Editor**, pega y ejecuta, en orden, cada archivo de `supabase/migrations/` (de `0001` a `0012`).
3. Despliega la **Edge Function `avisar`** (**Edge Functions → Deploy a new function**, nombre `avisar`, con el código de [`supabase/functions/avisar/index.ts`](supabase/functions/avisar/index.ts)) y **desactiva Verify JWT** en sus ajustes: la llamada de cada mañana y la del atajo de Apple Pay no llevan sesión, y la propia función comprueba la sesión o la clave. Las claves para firmar los avisos se crean solas la primera vez.
4. En **Authentication → URL Configuration**, pon como *Site URL* la dirección de la app (por ejemplo `https://gastos-xxx.vercel.app`) y añádela también en *Redirect URLs*. Para probar en local, añade `http://localhost:5173`.
5. En **Project Settings → API** copia la *Project URL* y la clave *anon public*.
6. **Despliega en Vercel** importando este repositorio y define estas variables de entorno:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`

   La clave *anon* es pública por diseño (va dentro de la web); lo que protege los datos son las políticas RLS. **Nunca** uses la clave `service_role` en la app ni la subas al repositorio.
7. Entra en la app con tu email, crea el espacio y, en **Ajustes**, invita a tu pareja con su email. Pásale el enlace de la web: al entrar con ese email verá la invitación.
8. Cuando ya estéis los dos dentro, en Supabase ve a **Authentication → Sign In / Providers** y desactiva *Allow new users to sign up*. Así nadie más puede ni siquiera crear una cuenta (aunque tampoco podría ver vuestros datos).

> El envío de emails de Supabase en el plan gratuito tiene un límite bajo por hora; para dos personas sobra. Si algún enlace no llega, revisa la carpeta de spam. La app acepta también un código de 6 dígitos del correo, pero solo llega si se configura un servidor de correo propio (**Set up SMTP**) y se editan las plantillas con `{{ .Token }}`.

## Al actualizar la app

Vercel publica solo cada cambio que llega a `main`. Si el cambio trae un archivo nuevo en `supabase/migrations/`, hay que ejecutarlo una vez en Supabase **antes** de fusionar, para que la base de datos ya tenga lo que la nueva versión necesita. Si cambia `supabase/functions/avisar/index.ts`, hay que volver a desplegar la función (manteniendo Verify JWT desactivado).

Con el conector de Supabase activado en Claude, Claude puede aplicar la migración y desplegar la función directamente; si no, se pega el archivo en el **SQL Editor**.

## El trabajo de cada mañana

`0010_automatico.sql` programa con **pg_cron** la función `run_automation()` a las 8:00 UTC: apunta los gastos fijos (comunes y personales) y, con **pg_net**, llama a la función `avisar` con la clave guardada en la tabla `automation` para mandar los avisos del día. La app también apunta los fijos pendientes al abrirse, una sola vez aunque los dos móviles lo hagan a la vez. Ajustes → *Lo que la app hace sola* dice cuándo trabajó por última vez. Para lanzarlo a mano: `select public.run_automation();` en el SQL Editor.

## Apuntar al pagar con Apple Pay

Cada persona crea en su iPhone una automatización de **Atajos** («Cartera» → al pagar) que manda el importe y la tienda a `avisar?pago=CLAVE`. La función guarda el pago en `pending_payments` y avisa al móvil; nada cuenta hasta que se confirma en la app como gasto común o personal. La guía y la dirección con la clave de cada uno están en **Ajustes → Apuntar al pagar con Apple Pay**.

## Versiones

La app sigue versionado semántico (`MAYOR.MENOR.PARCHE`): funciones nuevas suben la versión menor (3.11.0), correcciones la de parche (3.11.1) y los cambios muy grandes la mayor (3.0.0 fue la lista de la compra). Cada versión publicada:

1. Sube `version` en `package.json` (`npm version 3.12.0 --no-git-tag-version`).
2. Añade una entrada al principio de [`src/changelog.ts`](src/changelog.ts) con sus novedades, mejoras y correcciones. La app la muestra en **Ajustes → Ver novedades** y avisa una vez al abrir la versión nueva.

Un test comprueba que ambas versiones coinciden. Los cambios que no tocan la app (como este README) no suben versión.

## Desarrollo local

```bash
npm install
cp .env.example .env.local   # y rellena las dos variables
npm run dev                  # http://localhost:5173
```

Pruebas:

```bash
npm test                     # saldo, presupuestos, importes, tickets, extractos, compra…
DATABASE_URL=postgres://… scripts/test-db.sh   # migraciones + pruebas de acceso en un Postgres vacío
```

`scripts/test-db.sh` aplica todas las migraciones sobre una imitación mínima del esquema de Supabase (`supabase/tests/00_stub_supabase.sql`) y comprueba, entre otras cosas, que una tercera cuenta no puede ver ni modificar gastos ajenos ni entrar en un espacio lleno, y que lo personal no lo ve la pareja. GitHub Actions ejecuta ambas pruebas y la compilación en cada PR.

## Cómo se calcula el saldo

Cada gasto pagado por una persona hace que la otra le deba su parte: la mitad por defecto o lo que se haya elegido en ese gasto (`owed_cents`). Un reembolso de A a B reduce lo que A debe a B. El cálculo está en [`src/lib/balance.ts`](src/lib/balance.ts) y trabaja en céntimos; solo se redondea al mostrarlo.

## Escaneo de tickets

El lector (Tesseract compilado a WebAssembly y el modelo de español, unos 6 MB) se copia a `public/ocr/` al ejecutar `npm run dev` o `npm run build` (`scripts/copy-ocr.mjs`) y se sirve desde la propia web, sin CDNs externos. Solo se descarga la primera vez que alguien escanea. Antes de leer una foto se recorta el papel del ticket ([`src/lib/ocr.ts`](src/lib/ocr.ts)); los PDF se leen directamente como texto con pdf.js ([`src/lib/pdfText.ts`](src/lib/pdfText.ts)). El texto se interpreta en [`src/lib/receipt.ts`](src/lib/receipt.ts): total, fecha, tienda, categoría y cada producto con su precio (con formatos propios para tiendas como E.Leclerc).

## Borrado de datos

- **Borrar el espacio**: elimina gastos, reembolsos, presupuestos, categorías, compra, viajes y huchas para los dos. Las cuentas siguen existiendo.
- **Borrar mi cuenta**: elimina tu cuenta, tus datos personales y te saca del espacio. Si eras la última persona, el espacio se borra entero. Si no, la otra persona conserva el historial (tus gastos aparecen como “Cuenta borrada”).

Exporta antes desde **Ajustes → Tus datos** si quieres guardar una copia.
