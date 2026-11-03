// Reparto proporcional a las asistencias, con redondeo justo:
// primero las partes enteras; las cajas restantes van a quienes tengan mayor residuo y luego mayor asistencia.
// Si el corte cae entre jugadores con la misma asistencia (mismo residuo), esas cajas no se asignan por
// nombre: quedan "a sorteo" entre ellos (ver `pool`) y solo se entregan cuando hay un sorteo vigente.
//
// Se usa aritmética entera para que dos jugadores con igual asistencia empaten exactamente.
function split(boxes, players) {
  const base = Object.fromEntries(players.map((p) => [p.id, 0]));
  const total = players.reduce((s, p) => s + p.count, 0);
  if (total <= 0 || boxes <= 0) return { base, pool: null };

  const raw = players.map((p) => {
    const product = boxes * p.count;
    return { id: p.id, count: p.count, floor: Math.floor(product / total), residue: product % total };
  });
  raw.forEach((r) => { base[r.id] = r.floor; });

  const rest = boxes - raw.reduce((s, r) => s + r.floor, 0);
  if (rest <= 0) return { base, pool: null };

  raw.sort((a, b) => b.residue - a.residue || b.count - a.count || a.id - b.id);
  const edge = raw[rest - 1];
  const tied = raw.filter((r) => r.residue === edge.residue && r.count === edge.count);
  const firstTied = raw.indexOf(tied[0]);
  raw.slice(0, firstTied).forEach((r) => { base[r.id] += 1; });

  const slots = rest - firstTied;
  if (tied.length <= slots) {
    tied.forEach((r) => { base[r.id] += 1; });
    return { base, pool: null };
  }

  const candidates = tied.map((r) => r.id).sort((a, b) => a - b);
  return { base, pool: { slots, candidates, key: `${slots}:${candidates.join(',')}` } };
}

// `draw` = { key, winners: [ids] } es el sorteo guardado de esta categoría. Solo vale si corresponde
// exactamente al grupo empatado actual; si cambió la asistencia, queda sin efecto y hay que sortear de nuevo.
function allocate(boxes, players, draw) {
  const { base, pool } = split(boxes, players);
  if (pool && draw && draw.key === pool.key) draw.winners.forEach((id) => { base[id] += 1; });
  return base;
}

// Cajas de esta categoría que van a sorteo entre jugadores empatados, o null si el reparto es exacto.
// `winners` es null mientras el sorteo no se haya hecho.
function raffleOf(boxes, players, draw) {
  const { pool } = split(boxes, players);
  if (!pool) return null;
  return { slots: pool.slots, candidates: pool.candidates, key: pool.key, winners: draw && draw.key === pool.key ? draw.winners : null };
}

module.exports = { allocate, raffleOf };
