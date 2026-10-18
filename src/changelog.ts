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
    version: '3.3.0',
    date: '2026-10-18',
    changes: [
      { kind: 'nuevo', text: 'La app rellena sola el gasto: al escribir el concepto (por ejemplo «Mercadona»), pone la categoría, quién suele pagarlo y el reparto como otras veces. Si nunca lo habíais apuntado, reconoce la tienda por su nombre. Lo que elijas a mano no lo vuelve a cambiar.' },
      { kind: 'nuevo', text: '«Esto parece un gasto fijo»: si apuntáis algo cada mes con un importe parecido (Netflix, la luz, el gimnasio), también al importar el extracto del banco, la app propone hacerlo fijo con un toque.' },
      { kind: 'nuevo', text: 'Los gastos fijos se apuntan solos cada mañana, aunque nadie abra la app, y os llega un aviso al móvil con lo que se ha apuntado.' },
      { kind: 'nuevo', text: 'Resúmenes en el móvil: cada lunes, lo que gastasteis la semana anterior; cada día 1, cómo fue el mes frente al presupuesto y cómo queda el saldo entre los dos. Se pueden quitar en Ajustes → Avisos en el móvil.' },
      { kind: 'mejora', text: 'Ajustes → «Lo que la app hace sola» explica qué hace cada mañana y si está funcionando.' },
    ],
  },
  {
    version: '3.2.0',
    date: '2026-10-17',
    changes: [
      { kind: 'nuevo', text: 'La compra se apunta sola como gasto: al pulsar «Terminar compra», escanea el ticket y la app rellena el total, la tienda y la fecha. Elige quién ha pagado y se guarda como gasto común con el reparto de siempre. Si no era una compra común, pulsa «Sin gasto».' },
      { kind: 'nuevo', text: 'Lo que costó cada producto: al escanear el ticket, la app empareja cada producto comprado con su línea del ticket. Si alguno no cuadra, eliges su línea; también puedes escribir el precio a mano.' },
      { kind: 'nuevo', text: 'La app recuerda los precios y cómo se llama cada producto en el ticket, así la próxima vez los empareja sola.' },
      { kind: 'nuevo', text: 'Cuánto costará la lista antes de ir: arriba sale «Unos 42 €» con los productos sin precio, y cuánto os queda del presupuesto del súper este mes. Cada producto enseña lo que costó la última vez.' },
      { kind: 'nuevo', text: 'Al abrir el gasto de una compra ves lo que se compró y lo que costó cada cosa. En el historial de la compra también salen los precios.' },
      { kind: 'mejora', text: 'El lector de tickets lee mejor las fotos difíciles: si la suma de los productos no cuadra con el total, vuelve a leer la foto de otra forma y se queda con la mejor lectura. Reconoce HiperDino, SuperDino y Spar, y Mercadona o Alcampo aunque no se lea el logotipo.' },
    ],
  },
  {
    version: '3.1.1',
    date: '2026-10-16',
    changes: [
      { kind: 'correccion', text: 'En iPhone ya se puede entrar en la app instalada: el enlace del correo siempre abría Safari. Crea una contraseña en Ajustes → Contraseña y entra con tu email y esa contraseña desde la app.' },
    ],
  },
  {
    version: '3.1.0',
    date: '2026-10-16',
    changes: [
      { kind: 'nuevo', text: 'Viajes y eventos: en Gastos → Viajes, crea uno con sus fechas (un viaje, una boda, una mudanza). Mientras dure, los gastos nuevos se apuntan en él solos, y ves su total, quién pagó qué y el saldo del viaje.' },
      { kind: 'nuevo', text: 'Avisos en el móvil: en Ajustes → Avisos en el móvil, el móvil te avisa cuando tu pareja apunta un gasto y cuando un presupuesto llega a su aviso, aunque la app esté cerrada. En iPhone hace falta tener la app instalada.' },
      { kind: 'nuevo', text: 'Sin cobertura también se puede apuntar: el gasto se guarda en el móvil con la marca «Sin subir» y se sube solo al volver la conexión. Y la app se abre sin conexión con los datos de la última vez.' },
      { kind: 'nuevo', text: 'Gastos habituales: al añadir un gasto salen los que más repetís (el café, la gasolina…). Un toque lo rellena todo como la última vez.' },
      { kind: 'correccion', text: 'El saldo ya sale igual en los dos móviles con importes impares a medias (antes uno veía 6,18 € y el otro 6,17 €).' },
      { kind: 'correccion', text: 'Al escanear un ticket sin «Total», la fecha con puntos (16.10.2026) ya no se toma por el importe.' },
      { kind: 'correccion', text: 'Los porcentajes del reparto se ven bien (29,3 % en vez de 29.299999999999997 %).' },
      { kind: 'correccion', text: 'Inicio y Presupuesto ya no dicen que os habéis pasado por gastos de categorías sin presupuesto: solo cuenta lo de las categorías con límite.' },
      { kind: 'correccion', text: 'El mes que estás mirando se mantiene al cambiar de pantalla, y en Gastos no se borra lo que estabas buscando.' },
    ],
  },
  {
    version: '3.0.1',
    date: '2026-10-14',
    changes: [
      { kind: 'mejora', text: 'Barra de abajo simétrica: tres secciones a cada lado del botón +. Ajustes pasa de la rueda de arriba a la barra, al final.' },
    ],
  },
  {
    version: '3.0.0',
    date: '2026-10-14',
    changes: [
      { kind: 'nuevo', text: 'Lista de la compra compartida, en la nueva sección Compra de la barra de abajo. Los dos veis y cambiáis la misma lista, y lo que hace uno le aparece al otro al momento.' },
      { kind: 'nuevo', text: 'Añadir es rápido: escribe «Leche» y pulsa Intro. También entiende «2 leche», «1,5 kg patatas» o «leche x6», y elige la categoría sola (si la cambias, la recuerda para la próxima vez).' },
      { kind: 'nuevo', text: 'Un toque marca un producto como comprado, con unos segundos para Deshacer. Arriba ves cuántos quedan y cuántos lleváis. Lo comprado no se borra: queda en «Comprados» y en el historial.' },
      { kind: 'nuevo', text: 'Recientes y habituales: lo que más compráis y lo último que comprasteis, para volver a apuntarlo con un toque y la misma cantidad.' },
      { kind: 'nuevo', text: 'Si apuntas algo que ya está en la lista, la app pregunta si sumar la cantidad, editarlo o añadirlo aparte.' },
      { kind: 'nuevo', text: 'Vista por pasillos (agrupada por categorías), buscador, cantidades con unidad (kg, g, litros, paquetes…), marca de importante, historial y «Terminar compra» para empezar la siguiente lista sin perder nada.' },
      { kind: 'mejora', text: 'Si falla la conexión, lo que apuntes no se pierde: se queda en la lista con un botón para reintentar y se guarda solo al volver la conexión.' },
    ],
  },
  {
    version: '2.2.0',
    date: '2026-10-14',
    changes: [
      { kind: 'nuevo', text: 'Previsión en Inicio: a partir del día 5, la app calcula en cuánto acabaréis el mes a este ritmo (contando los gastos fijos que faltan) y si os sobrará o os pasaréis del presupuesto.' },
      { kind: 'nuevo', text: 'Reparto por defecto: en Ajustes podéis elegir otro reparto distinto de a medias (por ejemplo 60/40) para todos los gastos nuevos. Se puede seguir cambiando en cada gasto, y los ya apuntados no cambian.' },
      { kind: 'mejora', text: 'Exportar a Excel con una hoja para cada cosa: gastos, reembolsos, presupuestos mes a mes, huchas, sus movimientos y tus movimientos personales.' },
      { kind: 'correccion', text: 'Tocar el nombre del espacio en Ajustes ya no deshace el cambio que hizo tu pareja.' },
      { kind: 'correccion', text: 'Los errores salen en castellano y explicados (por ejemplo, sin conexión o una categoría con un nombre repetido).' },
      { kind: 'correccion', text: 'El buscador encuentra importes escritos con punto, como 12.50 o 1.200.' },
      { kind: 'correccion', text: 'Si la app se queda abierta y vuelves a ella otro mes, ya enseña el mes nuevo.' },
    ],
  },
  {
    version: '2.1.0',
    date: '2026-10-14',
    changes: [
      { kind: 'nuevo', text: 'Presupuestos que se mantienen: el límite que pongas a una categoría sigue valiendo los meses siguientes hasta que lo cambies. Ya no hace falta copiarlo cada mes.' },
      { kind: 'nuevo', text: 'Deshacer al borrar: al borrar un gasto, un reembolso, una aportación a una hucha o un movimiento personal, tienes unos segundos para tocar Deshacer.' },
      { kind: 'nuevo', text: 'Huchas archivadas: las huchas que archives quedan en Presupuesto → Huchas archivadas, donde puedes ver sus movimientos y recuperarlas.' },
      { kind: 'correccion', text: 'Sin límite de gastos: antes, a partir de 1.000 gastos los más antiguos dejaban de cargarse y el saldo podía salir mal. Ahora se cargan todos.' },
      { kind: 'correccion', text: 'Los importes con punto de miles, como 1.200, ya se aceptan.' },
      { kind: 'correccion', text: 'Si al volver a la app falla la conexión, ya no se pierde lo que estabas escribiendo: sigues viendo los datos y sale un aviso para reintentar.' },
      { kind: 'correccion', text: 'El día de "Lo apuntó…" salía con un día de menos en los gastos apuntados de madrugada.' },
    ],
  },
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
