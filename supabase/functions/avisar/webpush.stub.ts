// Sustituye a jsr:@negrel/webpush en las pruebas con Vitest (vite.config.ts): las funciones
// que se prueban no mandan avisos de verdad.
export class ApplicationServer {}
export class PushMessageError extends Error {}
export const Urgency = { Normal: 'normal' };
