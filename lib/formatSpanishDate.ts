/** Ej: "Lunes 13 de abril, 2026" */
export function formatSpanishLongDate(d: Date): string {
  const raw = new Intl.DateTimeFormat('es-PE', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(d);
  return raw.charAt(0).toUpperCase() + raw.slice(1);
}
