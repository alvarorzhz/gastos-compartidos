const formatter = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' });

/** Formatea céntimos como euros ("12,34 €"). Redondea medios céntimos. */
export function formatEuros(cents: number): string {
  return formatter.format(Math.round(cents) / 100);
}

/**
 * Convierte lo que escribe la persona ("12,5", "12.50", "1.234,56") a céntimos.
 * Devuelve null si no es un importe positivo válido.
 */
export function parseEuros(input: string): number | null {
  let s = input.trim().replace(/\s|€/g, '');
  if (!s) return null;
  const lastComma = s.lastIndexOf(',');
  const lastDot = s.lastIndexOf('.');
  if (lastComma >= 0 && lastDot >= 0) {
    // El último separador es el decimal; el otro, de miles.
    const decimal = lastComma > lastDot ? ',' : '.';
    const thousands = decimal === ',' ? '.' : ',';
    s = s.split(thousands).join('').replace(decimal, '.');
  } else if (lastComma >= 0) {
    s = s.replace(',', '.');
  }
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return null;
  const cents = Math.round(parseFloat(s) * 100);
  return cents > 0 ? cents : null;
}

/** Céntimos a texto editable ("12,50"). */
export function centsToInput(cents: number): string {
  return (cents / 100).toFixed(2).replace('.', ',');
}
