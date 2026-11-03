// Modos de reparto de cajas de una temporada.
export const DISTRIBUTIONS = {
  periodo: { name: 'Todo el período', hint: 'una sola bolsa con el botín y la asistencia de toda la temporada' },
  semanal: { name: 'Semanal', hint: 'cada semana se reparte con su propio botín y su propia asistencia' },
  diario: { name: 'Diario', hint: 'cada día se reparte con su propio botín y su propia asistencia' },
};

const short = (s) => new Date(`${s}T12:00:00`).toLocaleDateString('es', { day: '2-digit', month: '2-digit' });
const long = (s) => new Date(`${s}T12:00:00`).toLocaleDateString('es', { weekday: 'short', day: '2-digit', month: '2-digit' });

// Número de semana (1, 2...) en que cae un día respecto al inicio de la temporada.
export const weekNumber = (startDate, day) => Math.floor((new Date(`${day}T00:00:00Z`) - new Date(`${startDate}T00:00:00Z`)) / 604800000) + 1;

// Nombre legible de un bloque de reparto. `from`/`to` son su primer y último día (null = sin fecha).
export function blockLabel(mode, key, from, to, weekNumber) {
  if (key === 'sin-fecha') return 'Botín sin fecha';
  if (mode === 'diario') return long(from);
  if (mode === 'semanal') return `Semana ${weekNumber} · ${short(from)} al ${short(to)}`;
  return 'Todo el período';
}
