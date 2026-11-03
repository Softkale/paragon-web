const { allocate, raffleOf } = require('./allocation');
const { seasonDays } = require('./dates');
const { LOOT_NAMES } = require('./schedule');

// 'periodo' = una sola bolsa con todo el período; 'semanal' y 'diario' reparten cada semana o cada día
// con el botín y la asistencia de ese bloque.
const MODES = ['periodo', 'semanal', 'diario'];
const LEGACY_KEY = 'sin-fecha'; // botín antiguo sin día/horario cuando el reparto es por bloques

const sum = (arr) => arr.reduce((a, b) => a + b, 0);

function blocksOf(season, days, mode) {
  if (mode === 'diario') return days.map((d) => ({ key: d, days: [d] }));
  if (mode === 'semanal') {
    return Array.from({ length: season.weeks }, (_, w) => {
      const week = days.slice(w * 7, w * 7 + 7);
      return { key: week[0], days: week };
    });
  }
  return [{ key: '', days }];
}

// Reparte las cajas de la temporada bloque por bloque.
//   players:    [{ id, name }]
//   attendance: filas con { user_id, day }
//   loot:       filas con { day, category, quantity } (day puede ser null en registros antiguos)
//   draws:      sorteos guardados { [bloque]: { [categoría]: { key, winners } } }
// Devuelve cada bloque con su inventario, asistencias, reparto por jugador y sorteos pendientes o hechos,
// más el total de la temporada (suma de los bloques).
function distribute({ season, players, attendance, loot, draws = {} }) {
  const mode = MODES.includes(season.distribution) ? season.distribution : 'periodo';
  const blocks = blocksOf(season, seasonDays(season.start_date, season.weeks), mode);
  if (mode !== 'periodo' && loot.some((l) => !l.day)) blocks.push({ key: LEGACY_KEY, days: null });

  const result = blocks.map((b) => {
    const inDays = b.days && mode !== 'periodo' ? new Set(b.days) : null;
    const att = inDays ? attendance.filter((a) => inDays.has(a.day)) : attendance;
    let lt = loot;
    if (b.key === LEGACY_KEY) lt = loot.filter((l) => !l.day);
    else if (inDays) lt = loot.filter((l) => l.day && inDays.has(l.day));

    const counts = {};
    att.forEach((a) => { counts[a.user_id] = (counts[a.user_id] || 0) + 1; });
    const inventory = Array(LOOT_NAMES.length).fill(0);
    lt.forEach((l) => { inventory[l.category] += l.quantity; });

    const roster = players.map((p) => ({ ...p, count: counts[p.id] || 0 }));
    const shares = Object.fromEntries(players.map((p) => [p.id, Array(LOOT_NAMES.length).fill(0)]));
    const raffles = [];
    inventory.forEach((n, c) => {
      const draw = draws[b.key]?.[c];
      const alloc = allocate(n, roster, draw);
      players.forEach((p) => { shares[p.id][c] = alloc[p.id] || 0; });
      const r = raffleOf(n, roster, draw);
      if (r) raffles.push({ bucket: b.key, category: c, name: LOOT_NAMES[c], ...r });
    });

    // Hay botín pero nadie asistió en ese bloque: no se puede repartir.
    return { key: b.key, days: b.days, inventory, counts, shares, raffles, idle: att.length === 0 && sum(inventory) > 0 };
  });

  const inventory = Array(LOOT_NAMES.length).fill(0);
  const shares = Object.fromEntries(players.map((p) => [p.id, Array(LOOT_NAMES.length).fill(0)]));
  result.forEach((b) => {
    b.inventory.forEach((n, c) => { inventory[c] += n; });
    players.forEach((p) => b.shares[p.id].forEach((n, c) => { shares[p.id][c] += n; }));
  });

  return { mode, blocks: result, inventory, shares, raffles: result.flatMap((b) => b.raffles) };
}

module.exports = { MODES, distribute };
