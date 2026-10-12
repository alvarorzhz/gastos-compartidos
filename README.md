# Gastos compartidos

App web privada, pensada para el móvil, para que dos personas apunten sus gastos comunes, vean quién debe a quién (reparto 50/50) y comparen cada mes lo gastado con lo presupuestado.

- **Gastos**: importe, fecha, categoría, quién pagó y nota opcional. Cualquiera de los dos puede añadir, corregir o borrar.
- **Saldo**: se recalcula con cada gasto y reembolso. Los reembolsos (Bizum, transferencia…) solo se anotan; la app no mueve dinero.
- **Presupuesto**: un importe mensual por categoría, con barra de progreso y opción de copiar el del mes anterior.
- **Privacidad**: solo las dos cuentas del espacio ven los datos (lo garantiza la base de datos, no solo la app). Se puede exportar todo (CSV o JSON), borrar el espacio o borrar la cuenta.
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
2. En **SQL Editor**, pega y ejecuta el contenido de `supabase/migrations/0001_init.sql`.
3. En **Authentication → URL Configuration**, pon como *Site URL* la dirección donde vaya a vivir la app (por ejemplo `https://gastos-xxx.vercel.app`) y añádela también en *Redirect URLs*. Para probar en local, añade `http://localhost:5173`.
4. En **Project Settings → API** copia la *Project URL* y la clave *anon public*.
5. **Despliega en Vercel o Netlify** importando este repositorio y define estas variables de entorno:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`

   La clave *anon* es pública por diseño (va dentro de la web); lo que protege los datos son las políticas RLS. **Nunca** uses la clave `service_role` en la app ni la subas al repositorio.
6. Entra en la app con tu email, crea el espacio y, en **Ajustes**, invita a tu pareja con su email. Pásale el enlace de la web: al entrar con ese email verá la invitación.
7. Cuando ya estéis los dos dentro, en Supabase ve a **Authentication → Sign In / Providers** y desactiva *Allow new users to sign up*. Así nadie más puede ni siquiera crear una cuenta (aunque tampoco podría ver vuestros datos).

> El envío de emails de Supabase en el plan gratuito tiene un límite bajo por hora; para dos personas sobra. Si algún enlace no llega, revisa la carpeta de spam.

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

Con reparto 50/50, cada gasto pagado por una persona hace que la otra le deba la mitad. Un reembolso de A a B reduce lo que A debe a B. El cálculo está en [`src/lib/balance.ts`](src/lib/balance.ts) y trabaja en céntimos; solo se redondea al mostrarlo.

## Borrado de datos

- **Borrar el espacio**: elimina gastos, reembolsos, presupuestos y categorías para los dos. Las cuentas siguen existiendo.
- **Borrar mi cuenta**: elimina tu cuenta y te saca del espacio. Si eras la última persona, el espacio se borra entero. Si no, la otra persona conserva el historial (tus gastos aparecen como “Cuenta borrada”).

Exporta antes desde **Ajustes → Tus datos** si quieres guardar una copia.
