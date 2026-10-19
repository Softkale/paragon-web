const express = require('express');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');
const { seasonEnd, seasonDays } = require('../lib/dates');
const { SLOTS, LOOT_NAMES, KUNDUM_COUNT } = require('../lib/schedule');

// Reporte de cajas obtenidas: visible para cualquier usuario con sesión.
// Solo lee season_loot. Nunca incluye asistencias, asistentes ni reparto por jugador (eso es de oficial y admin).
const router = express.Router();
router.use(requireAuth);

const sum = (arr) => arr.reduce((a, b) => a + b, 0);
const round = (n, d = 2) => Math.round(n * 10 ** d) / 10 ** d;
const ratio = (a, b) => (b ? round(a / b) : 0);
const emptyCats = () => Array(LOOT_NAMES.length).fill(0);
const kundumOf = (cats) => sum(cats.slice(0, KUNDUM_COUNT));
const weekdayOf = (day) => (new Date(`${day}T00:00:00Z`).getUTCDay() + 6) % 7; // lunes = 0

// Lista de temporadas con sus totales de cajas (sirve de selector y de comparativo).
router.get('/seasons', async (_req, res) => {
  const [seasons, loot] = await Promise.all([
    db.query('SELECT * FROM seasons ORDER BY start_date DESC'),
    db.query(`SELECT season_id,
                     COALESCE(sum(quantity), 0)::int AS boxes,
                     COALESCE(sum(quantity) FILTER (WHERE category < $1), 0)::int AS kundum,
                     count(DISTINCT (day, slot))::int AS invasions
              FROM season_loot GROUP BY season_id`, [KUNDUM_COUNT]),
  ]);
  const L = Object.fromEntries(loot.rows.map((r) => [r.season_id, r]));
  res.json(seasons.rows.map((s) => {
    const boxes = L[s.id]?.boxes || 0;
    const invasions = L[s.id]?.invasions || 0;
    return {
      id: s.id, name: s.name, start_date: s.start_date, end_date: seasonEnd(s.start_date, s.weeks), weeks: s.weeks,
      boxes, kundum: L[s.id]?.kundum || 0, invasionsWithLoot: invasions, avgBoxesPerInvasion: ratio(boxes, invasions),
    };
  }));
});

router.get('/season/:id', async (req, res) => {
  const { rows } = await db.query('SELECT * FROM seasons WHERE id = $1', [req.params.id]);
  const season = rows[0];
  if (!season) return res.status(404).json({ error: 'Temporada no encontrada' });
  season.end_date = seasonEnd(season.start_date, season.weeks);

  const loot = await db.query('SELECT day, slot, category, quantity FROM season_loot WHERE season_id = $1', [season.id]);
  const days = seasonDays(season.start_date, season.weeks);

  const cell = {};
  days.forEach((day) => SLOTS.forEach((slot) => { cell[`${day}|${slot}`] = { day, slot, cats: emptyCats() }; }));
  const inventory = emptyCats(); // incluye registros antiguos sin día/horario
  loot.rows.forEach((l) => {
    inventory[l.category] += l.quantity;
    if (l.day) cell[`${l.day}|${l.slot.trim()}`].cats[l.category] += l.quantity;
  });

  const all = Object.values(cell).map((c) => ({ day: c.day, slot: c.slot, byCategory: c.cats, boxes: sum(c.cats), kundum: kundumOf(c.cats) }));
  const withLoot = all.filter((i) => i.boxes > 0);

  const byDay = days.map((day) => {
    const list = all.filter((i) => i.day === day);
    const cats = emptyCats();
    list.forEach((i) => i.byCategory.forEach((q, c) => { cats[c] += q; }));
    return {
      day, weekday: weekdayOf(day), boxes: sum(cats), kundum: kundumOf(cats), byCategory: cats,
      bySlot: Object.fromEntries(list.map((i) => [i.slot, i.boxes])),
    };
  });

  const bySlot = SLOTS.map((slot) => {
    const list = all.filter((i) => i.slot === slot);
    const cats = emptyCats();
    list.forEach((i) => i.byCategory.forEach((q, c) => { cats[c] += q; }));
    const invasions = list.filter((i) => i.boxes > 0).length;
    return { slot, invasions, boxes: sum(cats), kundum: kundumOf(cats), byCategory: cats, avgBoxes: ratio(sum(cats), invasions) };
  });

  const byWeekday = Array.from({ length: 7 }, (_, w) => {
    const list = byDay.filter((d) => d.weekday === w);
    const boxes = sum(list.map((d) => d.boxes));
    return { weekday: w, days: list.length, boxes, avgBoxes: ratio(boxes, list.length) };
  });

  const boxes = sum(inventory);
  res.json({
    season, slots: SLOTS, lootNames: LOOT_NAMES, kundumCount: KUNDUM_COUNT,
    totals: {
      boxes, kundum: kundumOf(inventory), byCategory: inventory,
      invasionsWithLoot: withLoot.length, avgBoxesPerInvasion: ratio(boxes, withLoot.length),
    },
    byDay, bySlot, byWeekday,
    byInvasion: withLoot,
  });
});

module.exports = router;
