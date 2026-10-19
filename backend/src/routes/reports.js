const express = require('express');
const db = require('../db');
const { requireAuth, requireRole } = require('../middleware/auth');
const { allocate } = require('../lib/allocation');
const { seasonEnd, seasonDays } = require('../lib/dates');
const { SLOTS, LOOT_NAMES, KUNDUM_COUNT } = require('../lib/schedule');

const router = express.Router();
router.use(requireAuth, requireRole('oficial'));

const sum = (arr) => arr.reduce((a, b) => a + b, 0);
const round = (n, d = 2) => Math.round(n * 10 ** d) / 10 ** d;
const ratio = (a, b) => (b ? round(a / b) : 0);
const emptyCats = () => Array(LOOT_NAMES.length).fill(0);
const kundumOf = (cats) => sum(cats.slice(0, KUNDUM_COUNT));
// Lunes = 0 ... Domingo = 6
const weekdayOf = (day) => (new Date(`${day}T00:00:00Z`).getUTCDay() + 6) % 7;

// Compara temporadas: totales de asistencia y botín de cada una.
router.get('/seasons', async (_req, res) => {
  const [seasons, att, held, loot] = await Promise.all([
    db.query('SELECT * FROM seasons ORDER BY start_date'),
    db.query('SELECT season_id, count(*)::int AS attendances, count(DISTINCT user_id)::int AS unique_players FROM invasion_attendance GROUP BY season_id'),
    db.query(`SELECT season_id, count(*)::int AS held FROM (
                SELECT season_id, day, slot FROM invasion_attendance
                UNION SELECT season_id, day, slot FROM season_loot WHERE day IS NOT NULL) x GROUP BY season_id`),
    db.query(`SELECT season_id, COALESCE(sum(quantity), 0)::int AS boxes,
                     COALESCE(sum(quantity) FILTER (WHERE category < $1), 0)::int AS kundum
              FROM season_loot GROUP BY season_id`, [KUNDUM_COUNT]),
  ]);
  const by = (res) => Object.fromEntries(res.rows.map((r) => [r.season_id, r]));
  const A = by(att); const H = by(held); const L = by(loot);

  res.json(seasons.rows.map((s) => {
    const attendances = A[s.id]?.attendances || 0;
    const invasionsHeld = H[s.id]?.held || 0;
    const boxes = L[s.id]?.boxes || 0;
    return {
      id: s.id, name: s.name, start_date: s.start_date, end_date: seasonEnd(s.start_date, s.weeks), weeks: s.weeks,
      attendances, uniquePlayers: A[s.id]?.unique_players || 0, invasionsHeld,
      boxes, kundum: L[s.id]?.kundum || 0,
      avgAttendance: ratio(attendances, invasionsHeld),
      boxesPerAttendance: ratio(boxes, attendances),
    };
  }));
});

// Datos completos de una temporada, ya agregados para mostrar y exportar.
async function seasonReport(id) {
  const { rows } = await db.query('SELECT * FROM seasons WHERE id = $1', [id]);
  const season = rows[0];
  if (!season) return null;
  season.end_date = seasonEnd(season.start_date, season.weeks);

  const [players, att, loot, delivered] = await Promise.all([
    db.query(
      `SELECT id, character_name AS name FROM users
       WHERE status = 'activo' OR id IN (SELECT user_id FROM invasion_attendance WHERE season_id = $1)
       ORDER BY lower(character_name)`,
      [season.id]
    ),
    db.query('SELECT user_id, day, slot, source FROM invasion_attendance WHERE season_id = $1', [season.id]),
    db.query('SELECT day, slot, category, quantity FROM season_loot WHERE season_id = $1', [season.id]),
    db.query('SELECT user_id FROM season_delivery WHERE season_id = $1', [season.id]),
  ]);

  const days = seasonDays(season.start_date, season.weeks);
  const opportunities = SLOTS.length * days.length;

  // Una celda por invasión (día + horario).
  const inv = {};
  days.forEach((day) => SLOTS.forEach((slot) => { inv[`${day}|${slot}`] = { day, slot, users: new Set(), cats: emptyCats() }; }));

  const perPlayer = {};
  att.rows.forEach((a) => {
    const slot = a.slot.trim();
    inv[`${a.day}|${slot}`]?.users.add(a.user_id);
    const p = (perPlayer[a.user_id] ||= { total: 0, bySlot: Object.fromEntries(SLOTS.map((s) => [s, 0])) });
    p.total += 1;
    p.bySlot[slot] += 1;
  });

  const inventory = emptyCats(); // incluye registros antiguos sin día/horario
  loot.rows.forEach((l) => {
    inventory[l.category] += l.quantity;
    if (l.day) inv[`${l.day}|${l.slot.trim()}`].cats[l.category] += l.quantity;
  });

  const byInvasion = Object.values(inv).map((i) => {
    const boxes = sum(i.cats);
    return {
      day: i.day, slot: i.slot, attendees: i.users.size, boxes, kundum: kundumOf(i.cats), byCategory: i.cats,
      boxesPerAttendee: ratio(boxes, i.users.size), held: i.users.size > 0 || boxes > 0,
    };
  });

  const byDay = days.map((day) => {
    const list = byInvasion.filter((i) => i.day === day);
    const cats = emptyCats();
    list.forEach((i) => i.byCategory.forEach((q, c) => { cats[c] += q; }));
    const users = new Set();
    att.rows.filter((a) => a.day === day).forEach((a) => users.add(a.user_id));
    return {
      day, weekday: weekdayOf(day),
      attendances: sum(list.map((i) => i.attendees)), uniquePlayers: users.size,
      boxes: sum(cats), kundum: kundumOf(cats), byCategory: cats,
      bySlot: Object.fromEntries(list.map((i) => [i.slot, { attendees: i.attendees, boxes: i.boxes }])),
    };
  });

  const bySlot = SLOTS.map((slot) => {
    const list = byInvasion.filter((i) => i.slot === slot);
    const held = list.filter((i) => i.held);
    const cats = emptyCats();
    list.forEach((i) => i.byCategory.forEach((q, c) => { cats[c] += q; }));
    const attendances = sum(list.map((i) => i.attendees));
    const boxes = sum(cats);
    return {
      slot, attendances, invasionsHeld: held.length,
      avgAttendance: ratio(attendances, held.length), boxes, kundum: kundumOf(cats), byCategory: cats,
      avgBoxes: ratio(boxes, held.length), boxesPerAttendee: ratio(boxes, attendances),
    };
  });

  const byWeekday = Array.from({ length: 7 }, (_, w) => {
    const list = byDay.filter((d) => d.weekday === w);
    const attendances = sum(list.map((d) => d.attendances));
    return { weekday: w, days: list.length, attendances, avgAttendance: ratio(attendances, list.length), boxes: sum(list.map((d) => d.boxes)) };
  });

  // Reparto por jugador (mismo cálculo que la planilla) y entregas.
  const roster = players.rows.map((p) => ({ ...p, count: perPlayer[p.id]?.total || 0 }));
  const shares = inventory.map((n) => allocate(n, roster));
  const deliveredSet = new Set(delivered.rows.map((d) => d.user_id));
  const playerRows = roster.map((p) => ({
    id: p.id, name: p.name, total: p.count, pct: round((p.count / opportunities) * 100, 1),
    bySlot: perPlayer[p.id]?.bySlot || Object.fromEntries(SLOTS.map((s) => [s, 0])),
    boxesShare: sum(shares.map((c) => c[p.id] || 0)), delivered: deliveredSet.has(p.id),
  }));

  const attendances = att.rows.length;
  const boxes = sum(inventory);
  const heldInvasions = byInvasion.filter((i) => i.held).length;
  const selfMarks = att.rows.filter((a) => a.source === 'self').length;

  return {
    season, opportunities, slots: SLOTS, lootNames: LOOT_NAMES, kundumCount: KUNDUM_COUNT,
    totals: {
      roster: roster.length, attendances, uniquePlayers: Object.keys(perPlayer).length,
      invasionsHeld: heldInvasions, invasionsTotal: byInvasion.length,
      avgAttendance: ratio(attendances, heldInvasions),
      participationPct: round((attendances / Math.max(1, roster.length * opportunities)) * 100, 1),
      boxes, kundum: kundumOf(inventory), byCategory: inventory,
      boxesPerAttendance: ratio(boxes, attendances), avgBoxesPerInvasion: ratio(boxes, heldInvasions),
      selfMarks, staffMarks: attendances - selfMarks,
      deliveredCount: playerRows.filter((p) => p.boxesShare > 0 && p.delivered).length,
      toDeliverCount: playerRows.filter((p) => p.boxesShare > 0).length,
    },
    byDay, bySlot, byWeekday, byInvasion, players: playerRows,
  };
}

router.get('/season/:id', async (req, res) => {
  const report = await seasonReport(req.params.id);
  if (!report) return res.status(404).json({ error: 'Temporada no encontrada' });
  res.json(report);
});

// Exportación CSV (Excel en español: separador ';' y BOM para las tildes).
const csv = (rows) => `﻿${rows.map((r) => r.map((v) => `"${String(v ?? '').replace(/"/g, '""')}"`).join(';')).join('\r\n')}`;

router.get('/season/:id/export', async (req, res) => {
  const report = await seasonReport(req.params.id);
  if (!report) return res.status(404).json({ error: 'Temporada no encontrada' });
  const type = req.query.type === 'players' ? 'players' : 'invasions';
  const safeName = report.season.name.replace(/[^\w-]+/g, '_');

  const rows = type === 'players'
    ? [
        ['Jugador', 'Asistencias', `Oportunidades`, '% participación', ...SLOTS.map((s) => `Asist. ${s}`), 'Cajas asignadas', 'Entregado'],
        ...report.players.map((p) => [p.name, p.total, report.opportunities, p.pct, ...SLOTS.map((s) => p.bySlot[s]), p.boxesShare, p.delivered ? 'Sí' : 'No']),
      ]
    : [
        ['Día', 'Horario', 'Asistentes', ...LOOT_NAMES, 'Total cajas', 'Total Kundum (+1 a +5)', 'Cajas por asistente'],
        ...report.byInvasion.filter((i) => i.held).map((i) => [i.day, i.slot, i.attendees, ...i.byCategory, i.boxes, i.kundum, i.boxesPerAttendee]),
      ];

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="PARAGON_${safeName}_${type}.csv"`);
  res.send(csv(rows));
});

module.exports = router;
