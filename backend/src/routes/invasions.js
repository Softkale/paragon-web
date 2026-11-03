const express = require('express');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');
const { distribute } = require('../lib/distribution');
const { groupDraws } = require('../lib/raffle');
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
  const [seasons, att, loot, delivered, raffle] = await Promise.all([
    db.query('SELECT * FROM seasons ORDER BY start_date DESC'),
    db.query('SELECT season_id, user_id, day, slot FROM invasion_attendance'),
    db.query('SELECT season_id, day, category, quantity FROM season_loot'),
    db.query('SELECT season_id FROM season_delivery WHERE user_id = $1', [me]),
    db.query('SELECT season_id, bucket, category, user_id, pos, pool_key FROM season_raffle'),
  ]);
  const draws = groupDraws(raffle.rows);
  const { day: today } = nowIn((await getSettings()).timezone);
  const deliveredSet = new Set(delivered.rows.map((d) => d.season_id));

  const report = seasons.rows.map((s) => {
    const end = seasonEnd(s.start_date, s.weeks);
    const rows = att.rows.filter((a) => a.season_id === s.id);
    // Mismo cálculo que la planilla (por período, semana o día según la configuración de la temporada).
    const ids = [...new Set(rows.map((r) => r.user_id))];
    const dist = distribute({
      season: s, players: ids.map((id) => ({ id })), attendance: rows,
      loot: loot.rows.filter((l) => l.season_id === s.id), draws: draws[s.id] || {},
    });
    const boxes = dist.shares[me] || Array(LOOT_NAMES.length).fill(0);
    // Sorteos de cajas sobrantes en los que participa el usuario (pendiente, ganado o no salió).
    const raffles = dist.raffles
      .filter((r) => r.candidates.includes(me))
      .map((r) => {
        const block = dist.blocks.find((x) => x.key === r.bucket);
        return {
          bucket: r.bucket, from: block.days?.[0] || null, to: block.days?.[block.days.length - 1] || null,
          category: r.category, name: r.name, slots: r.slots, participants: r.candidates.length,
          status: !r.winners ? 'pending' : r.winners.includes(me) ? 'won' : 'lost',
        };
      });

    const mine = rows.filter((a) => a.user_id === me);
    const bySlot = Object.fromEntries(SLOTS.map((slot) => [slot, 0]));
    mine.forEach((a) => { bySlot[a.slot.trim()] += 1; });
    const opportunities = SLOTS.length * 7 * s.weeks;

    return {
      id: s.id, name: s.name, kind: s.kind, distribution: dist.mode, start_date: s.start_date, end_date: end, weeks: s.weeks,
      current: s.start_date <= today && today <= end,
      attendances: mine.length, opportunities, bySlot,
      attended: mine.map((a) => ({ day: a.day, slot: a.slot.trim() })).sort((a, b) => b.day.localeCompare(a.day) || b.slot.localeCompare(a.slot)),
      boxes, raffles, totalBoxes: sum(boxes), delivered: deliveredSet.has(s.id),
    };
  });

  res.json({ slots: SLOTS, lootNames: LOOT_NAMES, seasons: report });
});

module.exports = router;
