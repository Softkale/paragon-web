const crypto = require('crypto');

// Agrupa las filas de season_raffle como
// { [season_id]: { [bloque]: { [categoría]: { key, winners: [ids en orden de salida] } } } }.
// El bloque es '' (todo el período), el día (reparto diario) o el primer día de la semana (reparto semanal).
function groupDraws(rows) {
  const out = {};
  rows.forEach((r) => {
    const byBlock = ((out[r.season_id] ||= {})[r.bucket] ||= {});
    const draw = (byBlock[r.category] ||= { key: r.pool_key, winners: [] });
    draw.winners[r.pos] = r.user_id;
  });
  return out;
}

// Elige `slots` ganadores al azar entre `candidates` (criptográficamente aleatorio), en orden de salida.
function pickWinners(candidates, slots) {
  const pool = [...candidates];
  const winners = [];
  while (winners.length < slots && pool.length) {
    winners.push(pool.splice(crypto.randomInt(pool.length), 1)[0]);
  }
  return winners;
}

module.exports = { groupDraws, pickWinners };
