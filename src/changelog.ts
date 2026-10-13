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
