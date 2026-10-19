// Reparto proporcional a las asistencias, con redondeo justo:
// primero las partes enteras; las cajas restantes van a quienes tengan mayor residuo,
// y en empate a mayor asistencia y luego orden alfabético.
function allocate(boxes, players) {
  const total = players.reduce((s, p) => s + p.count, 0);
  const result = Object.fromEntries(players.map((p) => [p.id, 0]));
  if (total <= 0 || boxes <= 0) return result;

  const raw = players.map((p) => {
    const expected = (boxes * p.count) / total;
    return { ...p, floor: Math.floor(expected), residue: expected - Math.floor(expected) };
  });
  raw.forEach((r) => { result[r.id] = r.floor; });

  const rest = boxes - raw.reduce((s, r) => s + r.floor, 0);
  raw
    .sort((a, b) => b.residue - a.residue || b.count - a.count || a.name.localeCompare(b.name, 'es'))
    .slice(0, rest)
    .forEach((r) => { result[r.id] += 1; });
  return result;
}

module.exports = { allocate };
