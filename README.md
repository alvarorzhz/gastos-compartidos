# Gastos compartidos

App web privada, pensada para el móvil, para que dos personas apunten sus gastos comunes, vean quién debe a quién (reparto 50/50) y comparen cada mes lo gastado con lo presupuestado.

- **Gastos**: importe, fecha, categoría, quién pagó y nota opcional. Cualquiera de los dos puede añadir, corregir o borrar.
- **Reparto**: 50/50 por defecto; en cada gasto se puede elegir otro porcentaje, un importe exacto o que sea solo de una persona.
- **Saldo**: se recalcula con cada gasto y reembolso. Los reembolsos (Bizum, transferencia…) solo se anotan; la app no mueve dinero.
- **Presupuesto**: un importe mensual por categoría, con barra de progreso y opción de copiar el del mes anterior. Cada categoría avisa al llegar al 80, 90 o 100 % (o no avisa).
- **Gastos fijos**: alquiler, luz, gimnasio… se apuntan solos cada semana, mes o año, cada mañana aunque nadie abra la app. Si algo se repite cada mes sin ser fijo, la app propone hacerlo fijo.
- **Lo hace sola**: al escribir el concepto de un gasto, elige la categoría, quién suele pagar y el reparto como otras veces. Cada mañana avisa en el móvil de los fijos apuntados; los lunes manda el resumen de la semana y el día 1 el del mes con el saldo.
- **Personal**: cada persona apunta sus propios gastos e ingresos. Solo los ve quien los apunta (ni la pareja) y no cuentan en el saldo, el presupuesto ni los gráficos comunes.
- **Escanear tickets**: una foto al ticket rellena importe, fecha, tienda y categoría. Se lee en el propio móvil con [Tesseract](https://github.com/naptha/tesseract.js); la foto no se sube ni se guarda.
- **Buscador y gráficos**: búsqueda por texto y categoría; gráficos de los últimos 12 meses, por categoría, por persona y fijos frente a variables.
- **Privacidad**: solo las dos cuentas del espacio ven los datos (lo garantiza la base de datos, no solo la app). Se puede exportar todo (Excel con una hoja por tabla, o JSON), borrar el espacio o borrar la cuenta.
- **Acceso sin contraseña**: se entra con el enlace que llega por email, o con un código de 6 dígitos si se configura la plantilla (ver abajo).
- **Instalable**: se puede añadir a la pantalla de inicio del móvil y se abre a pantalla completa.
- **Tiempo real**: lo que apunta una persona aparece al momento en el móvil de la otra.
- Moneda: EUR. Sin conexión bancaria ni modo sin conexión en esta versión.

## Cómo está hecha

| Pieza | Elección | Por qué |
| --- | --- | --- |
| Interfaz | React + TypeScript + Vite | Web estática, rápida en móvil, se aloja gratis |
| Datos y login | [Supabase](https://supabase.com) (Postgres + Auth) | Plan gratuito suficiente para dos personas; login por enlace al email; seguridad por filas (RLS) |
| Alojamiento | Vercel o Netlify (plan gratuito) | Despliegan desde un repositorio privado sin coste |

Toda la lógica de permisos está en [`supabase/migrations/0001_init.sql`](supabase/migrations/0001_init.sql):

- Un **espacio** (`households`) tiene como máximo **dos miembros** y cada cuenta pertenece a un único espacio.
- Las políticas RLS hacen que cada consulta devuelva solo filas del espacio propio. Además, quien paga un gasto o un reembolso tiene que ser miembro del espacio, y la categoría también tiene que ser suya.
- La segunda persona entra por **invitación a su email**. El email invitado se borra en cuanto acepta.
- Solo se guarda un nombre visible por persona; el email vive únicamente en el sistema de login de Supabase.

## Puesta en marcha (una vez)

1. **Crea un proyecto en Supabase** (plan Free, región UE, por ejemplo Frankfurt o París).
2. En **SQL Editor**, pega y ejecuta, en orden, cada archivo de `supabase/migrations/` (`0001_init.sql`, `0002_reparto_y_tiempo_real.sql`, `0003_fijos_y_avisos.sql`, `0004_personal.sql`, `0005_huchas_y_fijos_personales.sql`, `0006_reparto_por_defecto.sql`…). Cada archivo se ejecuta una sola vez.
3. En **Authentication → URL Configuration**, pon como *Site URL* la dirección donde vaya a vivir la app (por ejemplo `https://gastos-xxx.vercel.app`) y añádela también en *Redirect URLs*. Para probar en local, añade `http://localhost:5173`.
   *Opcional:* para que el correo traiga también un código de 6 dígitos (más cómodo en el móvil), en **Authentication → Emails → Templates** edita las plantillas *Magic Link* y *Confirm signup*. Supabase solo permite editarlas si antes configuras un servidor de correo propio (**Set up SMTP**, por ejemplo con Brevo gratis), lo que además quita el límite de pocos correos por hora. Ejemplo de plantilla:

   ```html
   <h2>Tu código para Gastos compartidos</h2>
   <p style="font-size:28px;letter-spacing:6px"><strong>{{ .Token }}</strong></p>
   <p>O entra con este enlace: <a href="{{ .ConfirmationURL }}">Entrar</a></p>
   ```
4. En **Project Settings → API** copia la *Project URL* y la clave *anon public*.
5. **Despliega en Vercel o Netlify** importando este repositorio y define estas variables de entorno:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`

   La clave *anon* es pública por diseño (va dentro de la web); lo que protege los datos son las políticas RLS. **Nunca** uses la clave `service_role` en la app ni la subas al repositorio.
6. Entra en la app con tu email, crea el espacio y, en **Ajustes**, invita a tu pareja con su email. Pásale el enlace de la web: al entrar con ese email verá la invitación.
7. Cuando ya estéis los dos dentro, en Supabase ve a **Authentication → Sign In / Providers** y desactiva *Allow new users to sign up*. Así nadie más puede ni siquiera crear una cuenta (aunque tampoco podría ver vuestros datos).

> El envío de emails de Supabase en el plan gratuito tiene un límite bajo por hora; para dos personas sobra. Si algún enlace no llega, revisa la carpeta de spam.

## Al actualizar la app

Vercel publica solo cada cambio que llega a `main`. Si el cambio trae un archivo nuevo en `supabase/migrations/`, ejecútalo una vez en el **SQL Editor** de Supabase **antes** de fusionar, para que la base de datos ya tenga lo que la nueva versión necesita.

## El trabajo de cada mañana

`0010_automatico.sql` programa con **pg_cron** (gratis en Supabase) la función `run_automation()` a las 8:00 UTC: apunta los gastos fijos de todos y, con **pg_net**, llama a la función `avisar` con la clave guardada en la tabla `automation`. La función `avisar` tiene que desplegarse con **Verify JWT desactivado** (la llamada del servidor no lleva sesión; la función comprueba ella misma la sesión o la clave). Ajustes → *Lo que la app hace sola* dice cuándo trabajó por última vez. Para lanzarlo a mano: `select public.run_automation();` en el SQL Editor.

## Versiones

La app sigue versionado semántico (`MAYOR.MENOR.PARCHE`): funciones nuevas suben la versión menor (1.1.0), correcciones la de parche (1.0.1). Cada versión publicada:

1. Sube `version` en `package.json` (`npm version 1.1.0 --no-git-tag-version`).
2. Añade una entrada al principio de [`src/changelog.ts`](src/changelog.ts) con sus novedades, mejoras y correcciones. La app la muestra en **Ajustes → Ver novedades** y avisa una vez al abrir la versión nueva.

Un test comprueba que ambas versiones coinciden.

## Desarrollo local

```bash
npm install
cp .env.example .env.local   # y rellena las dos variables
npm run dev                  # http://localhost:5173
```

Pruebas:

```bash
npm test                     # cálculo del saldo, presupuestos, importes y CSV
DATABASE_URL=postgres://… scripts/test-db.sh   # migración + pruebas de acceso en un Postgres vacío
```

`scripts/test-db.sh` aplica la migración sobre una imitación mínima del esquema de Supabase (`supabase/tests/00_stub_supabase.sql`) y comprueba, entre otras cosas, que una tercera cuenta no puede ver ni modificar gastos ajenos ni entrar en un espacio lleno. GitHub Actions ejecuta ambas pruebas en cada PR.

## Cómo se calcula el saldo

Cada gasto pagado por una persona hace que la otra le deba su parte: la mitad por defecto o lo que se haya elegido en ese gasto (`owed_cents`). Un reembolso de A a B reduce lo que A debe a B. El cálculo está en [`src/lib/balance.ts`](src/lib/balance.ts) y trabaja en céntimos; solo se redondea al mostrarlo.

## Gastos fijos

Cada gasto fijo es una plantilla (`recurring_expenses`) con fecha de inicio y frecuencia. Al abrir la app se llama a `generate_recurring_expenses`, que apunta como gastos normales los que ya tocan, una sola vez aunque los dos móviles la llamen a la vez. Los meses conservan el día (si no existe, el último del mes). No hace falta ningún servidor ni tarea programada: si nadie abre la app en semanas, al abrirla se apuntan todos los pendientes con su fecha.

## Escaneo de tickets

El lector (Tesseract compilado a WebAssembly y el modelo de español, unos 6 MB) se copia a `public/ocr/` al ejecutar `npm run dev` o `npm run build` (`scripts/copy-ocr.mjs`) y se sirve desde la propia web, sin CDNs externos. Solo se descarga la primera vez que alguien escanea. El texto leído se interpreta en [`src/lib/receipt.ts`](src/lib/receipt.ts): busca la línea del total (ignorando subtotal, IVA, entregado y cambio), la primera fecha válida no futura y la tienda; para tiendas conocidas (Mercadona, Lidl, Repsol…) propone categoría.

## Borrado de datos

- **Borrar el espacio**: elimina gastos, reembolsos, presupuestos y categorías para los dos. Las cuentas siguen existiendo.
- **Borrar mi cuenta**: elimina tu cuenta y te saca del espacio. Si eras la última persona, el espacio se borra entero. Si no, la otra persona conserva el historial (tus gastos aparecen como “Cuenta borrada”).

Exporta antes desde **Ajustes → Tus datos** si quieres guardar una copia.
