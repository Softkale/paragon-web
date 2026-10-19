// Fechas 'YYYY-MM-DD' manejadas en UTC para evitar corrimientos por zona horaria.
const isDate = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`));

function addDays(s, n) {
  const d = new Date(`${s}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

const seasonEnd = (start, weeks) => addDays(start, weeks * 7 - 1);

function seasonDays(start, weeks) {
  return Array.from({ length: weeks * 7 }, (_, i) => addDays(start, i));
}

module.exports = { isDate, addDays, seasonEnd, seasonDays };
