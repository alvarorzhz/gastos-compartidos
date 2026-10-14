/** Genera CSV separado por punto y coma (lo que espera Excel en español). */
export function toCsv(headers: string[], rows: (string | number | null)[][]): string {
  const escape = (v: string | number | null) => {
    const s = v == null ? '' : String(v);
    return /[;"\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [headers, ...rows].map((r) => r.map(escape).join(';')).join('\r\n') + '\r\n';
}

export function downloadFile(filename: string, content: string | Uint8Array, mime: string) {
  // BOM para que Excel lea bien los acentos.
  const part = typeof content === 'string' && mime.startsWith('text/csv') ? '\ufeff' + content : content;
  const blob = new Blob([part as BlobPart], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
