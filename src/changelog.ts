/**
 * Historial de versiones que se muestra en Ajustes → Novedades.
 *
 * Al publicar una versión nueva: sube "version" en package.json y añade una
 * entrada AL PRINCIPIO de esta lista con la misma versión (hay un test que lo comprueba).
 * Versionado: X.0.0 cambios grandes, 1.X.0 funciones nuevas, 1.0.X correcciones.
 */

export type ChangeKind = 'nuevo' | 'mejora' | 'correccion';

export interface Release {
  version: string;
  date: string; // YYYY-MM-DD
  changes: { kind: ChangeKind; text: string }[];
}

export const APP_VERSION = __APP_VERSION__;

export const CHANGELOG: Release[] = [
  {
    version: '2.0.0',
    date: '2026-10-13',
    changes: [
      { kind: 'nuevo', text: 'Diseño nuevo en toda la app: más limpio, más cómodo en el móvil y con el mismo aspecto en todas las pantallas. Tus datos y cómo funciona todo siguen igual.' },
      { kind: 'nuevo', text: 'Pantalla de Inicio: de un vistazo, cuánto lleváis gastado este mes, cuánto presupuesto os queda, si vais dentro, el saldo entre los dos, los últimos gastos y en qué se os va el dinero.' },
      { kind: 'mejora', text: 'Botón central + en la barra de abajo para añadir un gasto desde cualquier sitio. El formulario tiene el importe en grande, las categorías con icono para elegir de un toque, botones de Hoy y Ayer, y el botón de guardar siempre a la vista.' },
      { kind: 'mejora', text: 'Nueva navegación: Inicio, Gastos (movimientos y saldo), Presupuesto (presupuesto y gráficos) y Personal. Ajustes está arriba a la derecha.' },
      { kind: 'mejora', text: 'Los gastos se agrupan por día, cada categoría tiene su icono y color, se ve quién pagó y quién lo apuntó, y se puede filtrar también por quién pagó.' },
      { kind: 'mejora', text: 'Presupuesto más claro: lo que queda, lo gastado y el porcentaje arriba, y cada categoría con su barra. Tocando una categoría se cambia el límite y el aviso.' },
      { kind: 'mejora', text: 'Mensajes de confirmación al guardar o borrar, ventanas propias para confirmar en lugar de las del navegador, y tema oscuro si el móvil lo usa.' },
      { kind: 'mejora', text: 'Más accesible: mejor contraste, botones más grandes, uso con teclado y animaciones que respetan la opción de reducir movimiento.' },
    ],
  },
  {
    version: '1.5.0',
    date: '2026-10-13',
    changes: [
      { kind: 'nuevo', text: 'Importar el extracto del banco: en Gastos o en Personal, toca 🏦 Importar y elige el Excel (o CSV) que descargas del banco. Ves todos los movimientos y eliges cuáles apuntar como gasto común, cuáles van a Personal y cuáles no. El archivo se lee en tu dispositivo y no se guarda.' },
      { kind: 'mejora', text: 'Al importar, la app sugiere la categoría por el comercio, recuerda dónde apuntaste antes algo con el mismo nombre y avisa de lo que parece ya apuntado para no duplicarlo.' },
    ],
  },
  {
    version: '1.4.0',
    date: '2026-10-13',
    changes: [
      { kind: 'nuevo', text: 'Cierre de mes: al empezar un mes nuevo, la app muestra una vez el resumen del anterior (cuánto gastasteis, comparado con el mes previo, en qué se os fue el presupuesto, quién pagó y el saldo). También se puede ver en Presupuesto → Ver resumen de este mes.' },
      { kind: 'nuevo', text: 'Huchas comunes en Presupuesto: cread objetivos de ahorro (viaje, sofá…) con una meta, y apuntad lo que mete o saca cada uno.' },
      { kind: 'nuevo', text: 'Fijos en Personal: ingresos y gastos que se apuntan solos cada semana, mes o año (nómina, gimnasio, suscripciones). Se pueden pausar, editar o borrar.' },
    ],
  },
  {
    version: '1.3.0',
    date: '2026-10-13',
    changes: [
      { kind: 'nuevo', text: 'Pestaña Personal: apunta tus propios gastos e ingresos. Solo los ves tú y no cuentan en los gastos comunes. Muestra lo que te queda en el mes, también descontando tu parte de lo común.' },
      { kind: 'mejora', text: 'Menos pestañas: Comunes (Gastos y Saldo), Resumen (Presupuesto y Gráficos), Personal y Ajustes.' },
      { kind: 'mejora', text: 'Tocar el saldo en Gastos lleva directamente a Saldo.' },
      { kind: 'mejora', text: 'La exportación incluye también tus movimientos personales.' },
    ],
  },
  {
    version: '1.2.0',
    date: '2026-10-13',
    changes: [
      { kind: 'nuevo', text: 'Escanear ticket: al añadir un gasto, haz una foto al ticket y la app rellena el importe total, la fecha, la tienda y, si la reconoce, la categoría. Revísalo antes de guardar.' },
      { kind: 'nuevo', text: 'El ticket se lee dentro del móvil: la foto no se envía a ningún sitio ni se guarda. La primera vez descarga el lector (unos 6 MB).' },
    ],
  },
  {
    version: '1.1.0',
    date: '2026-10-13',
    changes: [
      { kind: 'nuevo', text: 'Gastos fijos: al añadir un gasto puedes elegir que se repita cada semana, cada mes o cada año, y se apunta solo. Se ven, editan y pausan en Gastos → 🔁 Gastos fijos.' },
      { kind: 'nuevo', text: 'Buscador de gastos por nota, categoría, quién pagó o importe, con filtro por categoría, en el mes o en todo el historial.' },
      { kind: 'nuevo', text: 'Pestaña Gráficos: gasto de los últimos 12 meses (total o por categoría), en qué se va el dinero, quién ha pagado y cuánto es fijo.' },
      { kind: 'nuevo', text: 'Avisos de presupuesto por categoría al 80 %, 90 % o 100 %, o sin aviso. Se eligen en Presupuesto.' },
      { kind: 'nuevo', text: 'Al entrar en la app, una ventana reúne los presupuestos del mes que han llegado a su aviso. También se ven arriba en Gastos.' },
    ],
  },
  {
    version: '1.0.0',
    date: '2026-10-13',
    changes: [
      { kind: 'nuevo', text: 'Registro de gastos compartidos con importe, fecha, categoría, quién pagó y nota.' },
      { kind: 'nuevo', text: 'Saldo entre los dos y reembolsos para dejarlo a cero.' },
      { kind: 'nuevo', text: 'Reparto 50/50 por defecto, o por porcentaje, por importe o solo de una persona en cada gasto.' },
      { kind: 'nuevo', text: 'Presupuesto mensual por categoría comparado con lo gastado.' },
      { kind: 'nuevo', text: 'Espacio privado para dos personas con invitación por email.' },
      { kind: 'nuevo', text: 'Los cambios de tu pareja aparecen al momento, sin recargar.' },
      { kind: 'nuevo', text: 'Se puede instalar en el móvil desde Ajustes.' },
      { kind: 'nuevo', text: 'Exportar los datos (CSV o JSON) y borrar el espacio o la cuenta.' },
      { kind: 'nuevo', text: 'Historial de versiones con sus novedades y correcciones.' },
    ],
  },
];

export const KIND_LABEL: Record<ChangeKind, string> = {
  nuevo: 'Nuevo',
  mejora: 'Mejora',
  correccion: 'Corrección',
};
