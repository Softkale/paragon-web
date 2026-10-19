const db = require('../db');

// Invasiones todos los días, de lunes a domingo, en estos horarios (hora local del gremio).
const SLOTS = ['12:00', '17:00', '21:00'];

// Categorías de botín. Las 5 primeras son las cajas Kundum (+1 a +5).
const LOOT_NAMES = ['Cajas +1', 'Cajas +2', 'Cajas +3', 'Cajas +4', 'Cajas +5', 'Ancient Box', 'Legendary Box', 'Item Fenrir'];
const KUNDUM_COUNT = 5;

const DEFAULTS = { checkin_minutes: '30', timezone: 'America/Lima' };

async function getSettings() {
  const { rows } = await db.query('SELECT key, value FROM settings');
  const map = { ...DEFAULTS, ...Object.fromEntries(rows.map((r) => [r.key, r.value])) };
  return { checkin_minutes: Number(map.checkin_minutes), timezone: map.timezone };
}

const validTimezone = (tz) => {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return typeof tz === 'string' && tz.length > 0;
  } catch {
    return false;
  }
};

// Componentes de fecha/hora de un instante en la zona horaria indicada.
function partsIn(timeZone, date) {
  return Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
    }).formatToParts(date).map((p) => [p.type, p.value])
  );
}

// Fecha y segundos transcurridos del día en la zona horaria indicada.
function nowIn(timeZone, date = new Date()) {
  const p = partsIn(timeZone, date);
  return {
    day: `${p.year}-${p.month}-${p.day}`,
    seconds: Number(p.hour) * 3600 + Number(p.minute) * 60 + Number(p.second),
  };
}

// Desfase (ms) de una zona respecto a UTC en un instante dado.
function offsetMs(timeZone, date) {
  const p = partsIn(timeZone, date);
  const asUtc = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second);
  return asUtc - Math.floor(date.getTime() / 1000) * 1000;
}

// Instante real de "día + hora" interpretados en una zona horaria.
function zonedInstant(day, time, timeZone) {
  const [y, m, d] = day.split('-').map(Number);
  const [h, mi] = time.split(':').map(Number);
  const guess = Date.UTC(y, m - 1, d, h, mi);
  const first = guess - offsetMs(timeZone, new Date(guess));
  return new Date(guess - offsetMs(timeZone, new Date(first)));
}

// Hora de la invasión vista desde la zona del usuario: 'HH:MM' (24 h) y desfase de día (-1, 0, +1).
function localizeSlot(day, slot, guildTz, userTz) {
  const p = partsIn(userTz, zonedInstant(day, slot, guildTz));
  const localDay = `${p.year}-${p.month}-${p.day}`;
  return {
    localTime: `${p.hour}:${p.minute}`,
    dayOffset: Math.round((Date.parse(`${localDay}T00:00:00Z`) - Date.parse(`${day}T00:00:00Z`)) / 86400000),
  };
}

// Estado de una invasión en este instante: upcoming | open | closed.
// Un cierre/apertura manual manda sobre el horario.
function slotState({ slot, minutes, nowSeconds, override }) {
  const start = Number(slot.slice(0, 2)) * 3600 + Number(slot.slice(3, 5)) * 60;
  const end = start + minutes * 60;
  if (override === 'closed') return { state: 'closed', remaining: null };
  if (override === 'open') return { state: 'open', remaining: null };
  if (nowSeconds < start) return { state: 'upcoming', remaining: null, startsIn: start - nowSeconds };
  if (nowSeconds < end) return { state: 'open', remaining: end - nowSeconds };
  return { state: 'closed', remaining: null };
}

// Temporada que incluye el día dado, si existe.
async function seasonOn(day) {
  const { rows } = await db.query(
    'SELECT id, name, start_date, weeks FROM seasons WHERE start_date <= $1 AND start_date + (weeks * 7 - 1) >= $1 LIMIT 1',
    [day]
  );
  return rows[0] || null;
}

module.exports = { SLOTS, LOOT_NAMES, KUNDUM_COUNT, getSettings, validTimezone, nowIn, slotState, seasonOn, localizeSlot };
