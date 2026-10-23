const express = require('express');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');
const { allocate } = require('../lib/allocation');
const { seasonEnd } = require('../lib/dates');
const { SLOTS, LOOT_NAMES, getSettings, nowIn } = require('../lib/schedule');

const router = express.Router();
router.use(requireAuth);

const sum = (arr) => arr.reduce((a, b) => a + b, 0);

// Reporte personal: por cada temporada (o período sin liga), a qué invasiones asistió el usuario
// y cuántas cajas le tocan según el reparto. La asistencia la anota el oficial designado, así que
// ya puede haber datos de la persona desde antes de que completara su registro.
router.get('/mine', async (req, res) => {
  const me = req.user.id;
  const [seasons, att, loot, delivered] = await Promise.all([
    db.query('SELECT * FROM seasons ORDER BY start_date DESC'),
    db.query('SELECT season_id, user_id, day, slot FROM invasion_attendance'),
    db.query('SELECT season_id, category, quantity FROM season_loot'),
    db.query('SELECT season_id FROM season_delivery WHERE user_id = $1', [me]),
  ]);
  const { day: today } = nowIn((await getSettings()).timezone);
  const deliveredSet = new Set(delivered.rows.map((d) => d.season_id));

  const report = seasons.rows.map((s) => {
    const end = seasonEnd(s.start_date, s.weeks);
    const rows = att.rows.filter((a) => a.season_id === s.id);
    const counts = {};
    rows.forEach((a) => { counts[a.user_id] = (counts[a.user_id] || 0) + 1; });
    const roster = Object.entries(counts).map(([id, count]) => ({ id: Number(id), count, name: String(id) }));

    const inventory = Array(LOOT_NAMES.length).fill(0);
    loot.rows.filter((l) => l.season_id === s.id).forEach((l) => { inventory[l.category] += l.quantity; });
    const boxes = inventory.map((n) => allocate(n, roster)[me] || 0);

    const mine = rows.filter((a) => a.user_id === me);
    const bySlot = Object.fromEntries(SLOTS.map((slot) => [slot, 0]));
    mine.forEach((a) => { bySlot[a.slot.trim()] += 1; });
    const opportunities = SLOTS.length * 7 * s.weeks;

    return {
      id: s.id, name: s.name, kind: s.kind, start_date: s.start_date, end_date: end, weeks: s.weeks,
      current: s.start_date <= today && today <= end,
      attendances: mine.length, opportunities, bySlot,
      attended: mine.map((a) => ({ day: a.day, slot: a.slot.trim() })).sort((a, b) => b.day.localeCompare(a.day) || b.slot.localeCompare(a.slot)),
      boxes, totalBoxes: sum(boxes), delivered: deliveredSet.has(s.id),
    };
  });

  res.json({ slots: SLOTS, lootNames: LOOT_NAMES, seasons: report });
});

module.exports = router;
