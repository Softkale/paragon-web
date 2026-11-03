const crypto = require('crypto');

// Agrupa las filas de season_raffle como { [season_id]: { [category]: { key, winners: [ids en orden de salida] } } }.
function groupDraws(rows) {
  const out = {};
  rows.forEach((r) => {
    const bySeason = (out[r.season_id] ||= {});
    const draw = (bySeason[r.category] ||= { key: r.pool_key, winners: [] });
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
