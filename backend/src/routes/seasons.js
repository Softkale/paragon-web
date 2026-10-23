const express = require('express');
const db = require('../db');
const { requireAuth, requireRole, requireRecorder } = require('../middleware/auth');
const { allocate } = require('../lib/allocation');
const { isDate, seasonEnd, seasonDays } = require('../lib/dates');
const { SLOTS, LOOT_NAMES, getSettings, nowIn, slotState } = require('../lib/schedule');

const router = express.Router();
router.use(requireAuth, requireRole('oficial'));


const KINDS = ['liga', 'libre'];
const withEnd = (s) => ({ ...s, end_date: seasonEnd(s.start_date, s.weeks) });

async function getSeason(id) {
  const { rows } = await db.query('SELECT * FROM seasons WHERE id = $1', [id]);
  return rows[0] ? withEnd(rows[0]) : null;
}

// Valida nombre, fecha y duración; devuelve el error o null.
async function validateSeason({ name, kind, start_date, weeks }, ignoreId = 0) {
  if (!name || !name.trim()) return 'El nombre es obligatorio';
  if (!KINDS.includes(kind)) return 'Tipo inválido (liga o sin liga)';
  if (!isDate(start_date)) return 'Fecha de inicio inválida';
  if (!Number.isInteger(weeks) || weeks < 1 || weeks > 4) return 'La duración debe ser de 1 a 4 semanas';

  const { rows } = await db.query(
    `SELECT name FROM seasons WHERE id <> $1 AND start_date <= $2 AND start_date + (weeks * 7 - 1) >= $3 LIMIT 1`,
    [ignoreId, seasonEnd(start_date, weeks), start_date]
  );
  return rows[0] ? `Se cruza con la temporada "${rows[0].name}"` : null;
}

// when: past | today | future. state: upcoming | open | closed (solo hoy depende del reloj).
async function invasionState(day, slot) {
  const settings = await getSettings();
  const now = nowIn(settings.timezone);
  if (day > now.day) return { when: 'future', state: 'upcoming' };
  if (day < now.day) return { when: 'past', state: 'closed' };
  return { when: 'today', ...slotState({ slot, minutes: settings.checkin_minutes, nowSeconds: now.seconds }) };
}

router.get('/', async (_req, res) => {
  const { rows } = await db.query('SELECT * FROM seasons ORDER BY start_date DESC');
  res.json(rows.map(withEnd));
});

router.post('/', async (req, res) => {
  const body = { name: req.body?.name, kind: req.body?.kind || 'liga', start_date: req.body?.start_date, weeks: Number(req.body?.weeks) };
  const error = await validateSeason(body);
  if (error) return res.status(400).json({ error });
  const { rows } = await db.query(
    'INSERT INTO seasons (name, kind, start_date, weeks, created_by) VALUES ($1, $2, $3, $4, $5) RETURNING *',
    [body.name.trim(), body.kind, body.start_date, body.weeks, req.user.id]
  );
  res.status(201).json(withEnd(rows[0]));
});

router.put('/:id', async (req, res) => {
  const season = await getSeason(req.params.id);
  if (!season) return res.status(404).json({ error: 'Temporada no encontrada' });

  const body = { name: req.body?.name, kind: req.body?.kind || 'liga', start_date: req.body?.start_date, weeks: Number(req.body?.weeks) };
  const error = await validateSeason(body, season.id);
  if (error) return res.status(400).json({ error });

  // No se puede encoger la temporada dejando asistencias fuera del nuevo rango.
  const orphans = await db.query(
    'SELECT 1 FROM invasion_attendance WHERE season_id = $1 AND (day < $2 OR day > $3) LIMIT 1',
    [season.id, body.start_date, seasonEnd(body.start_date, body.weeks)]
  );
  if (orphans.rowCount) return res.status(400).json({ error: 'Hay asistencias registradas fuera del nuevo rango de fechas' });

  const { rows } = await db.query(
    'UPDATE seasons SET name = $1, kind = $2, start_date = $3, weeks = $4 WHERE id = $5 RETURNING *',
    [body.name.trim(), body.kind, body.start_date, body.weeks, season.id]
  );
  res.json(withEnd(rows[0]));
});

router.delete('/:id', requireRole('admin'), async (req, res) => {
  const { rowCount } = await db.query('DELETE FROM seasons WHERE id = $1', [req.params.id]);
  if (!rowCount) return res.status(404).json({ error: 'Temporada no encontrada' });
  res.status(204).end();
});

// Todo lo necesario para pintar la planilla: asistencias, botín, reparto y entregas.
router.get('/:id/sheet', async (req, res) => {
  const season = await getSeason(req.params.id);
  if (!season) return res.status(404).json({ error: 'Temporada no encontrada' });

  const [players, attendance, loot, delivered] = await Promise.all([
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

  const counts = {};
  attendance.rows.forEach((a) => { counts[a.user_id] = (counts[a.user_id] || 0) + 1; });
  const roster = players.rows.map((p) => ({ ...p, count: counts[p.id] || 0 }));

  // Total de la temporada por categoría (incluye registros antiguos sin día/horario) y matriz por invasión.
  const inventory = Array(8).fill(0);
  const lootByInvasion = {};
  loot.rows.forEach((l) => {
    inventory[l.category] += l.quantity;
    if (l.day) {
      const key = `${l.day}|${l.slot.trim()}`;
      (lootByInvasion[key] ||= Array(8).fill(0))[l.category] = l.quantity;
    }
  });

  const byCategory = inventory.map((n) => allocate(n, roster));
  const allocation = Object.fromEntries(roster.map((p) => [p.id, byCategory.map((c) => c[p.id] || 0)]));

  res.json({
    season,
    days: seasonDays(season.start_date, season.weeks),
    slots: SLOTS,
    lootNames: LOOT_NAMES,
    opportunities: SLOTS.length * 7 * season.weeks,
    players: roster,
    checks: attendance.rows.map((a) => `${a.user_id}|${a.day}|${a.slot.trim()}`),
    staffChecks: attendance.rows.filter((a) => a.source === 'staff').map((a) => `${a.user_id}|${a.day}|${a.slot.trim()}`),
    lootByInvasion,
    inventory,
    allocation,
    delivered: delivered.rows.map((d) => d.user_id),
  });
});

router.get('/:id/day/:day', async (req, res) => {
  const season = await getSeason(req.params.id);
  if (!season) return res.status(404).json({ error: 'Temporada no encontrada' });
  const { day } = req.params;
  if (!isDate(day) || day < season.start_date || day > season.end_date) {
    return res.status(400).json({ error: 'Ese día está fuera de la temporada' });
  }

  const settings = await getSettings();
  const now = nowIn(settings.timezone);
  const when = day > now.day ? 'future' : day < now.day ? 'past' : 'today';

  const [players, att] = await Promise.all([
    db.query(
      `SELECT id, character_name AS name FROM users
       WHERE status = 'activo' OR id IN (SELECT user_id FROM invasion_attendance WHERE season_id = $1)
       ORDER BY lower(character_name)`,
      [season.id]
    ),
    db.query(
      `SELECT a.user_id, u.character_name AS name, a.slot, a.source, a.marked_at, m.character_name AS marked_by
       FROM invasion_attendance a
       JOIN users u ON u.id = a.user_id
       LEFT JOIN users m ON m.id = a.marked_by
       WHERE a.season_id = $1 AND a.day = $2
       ORDER BY a.marked_at`,
      [season.id, day]
    ),
  ]);

  res.json({
    day,
    when,
    timezone: settings.timezone,
    minutes: settings.checkin_minutes,
    players: players.rows,
    slots: SLOTS.map((slot) => ({
      slot,
      state:
        when === 'today'
          ? slotState({ slot, minutes: settings.checkin_minutes, nowSeconds: now.seconds }).state
          : when === 'past' ? 'closed' : 'upcoming',
      attendees: att.rows
        .filter((a) => a.slot.trim() === slot)
        .map((a) => ({ user_id: a.user_id, name: a.name, source: a.source, marked_by: a.marked_by, marked_at: a.marked_at })),
    })),
  });
});

router.put('/:id/attendance', requireRecorder, async (req, res) => {
  const { user_id, day, slot, attended } = req.body || {};
  const season = await getSeason(req.params.id);
  if (!season) return res.status(404).json({ error: 'Temporada no encontrada' });
  if (!Number.isInteger(user_id) || !isDate(day) || !SLOTS.includes(slot)) {
    return res.status(400).json({ error: 'Datos de asistencia inválidos' });
  }
  if (day < season.start_date || day > season.end_date) {
    return res.status(400).json({ error: 'Ese día está fuera de la temporada' });
  }

  if (attended) {
    const timing = await invasionState(day, slot);
    if (timing.state === 'upcoming') return res.status(409).json({ error: 'Esa invasión aún no comienza' });
    const user = await db.query(`SELECT 1 FROM users WHERE id = $1 AND status = 'activo'`, [user_id]);
    if (!user.rowCount) return res.status(400).json({ error: 'El jugador no existe o no está activo' });
    const done = await db.query(
      `INSERT INTO invasion_attendance (season_id, user_id, day, slot, source, marked_by)
       VALUES ($1, $2, $3, $4, 'staff', $5) ON CONFLICT DO NOTHING`,
      [season.id, user_id, day, slot, req.user.id]
    );
    if (done.rowCount) await logAttendance('marcar', season.id, req.user.id, user_id, day, slot);
  } else {
    const done = await db.query('DELETE FROM invasion_attendance WHERE season_id = $1 AND user_id = $2 AND day = $3 AND slot = $4', [
      season.id, user_id, day, slot,
    ]);
    if (done.rowCount) await logAttendance('quitar', season.id, req.user.id, user_id, day, slot);
  }
  res.status(204).end();
});

// Deja constancia de quién marcó o quitó a quién (solo cuando hubo un cambio real).
const logAttendance = (action, seasonId, actorId, playerId, day, slot) =>
  db.query(
    `INSERT INTO attendance_log (season_id, action, actor_id, actor_name, player_id, player_name, day, slot)
     SELECT $1, $2, a.id, a.character_name, p.id, p.character_name, $5, $6
     FROM users a, users p WHERE a.id = $3 AND p.id = $4`,
    [seasonId, action, actorId, playerId, day, slot]
  );

// Historial de registros de la temporada y resumen por oficial.
router.get('/:id/attendance-log', async (req, res) => {
  if (!(await getSeason(req.params.id))) return res.status(404).json({ error: 'Temporada no encontrada' });
  const [log, summary] = await Promise.all([
    db.query(
      `SELECT id, action, actor_name, player_name, day, slot, created_at FROM attendance_log
       WHERE season_id = $1 ORDER BY created_at DESC, id DESC LIMIT 300`,
      [req.params.id]
    ),
    db.query(
      `SELECT actor_name, count(*) FILTER (WHERE action = 'marcar')::int AS marks,
              count(*) FILTER (WHERE action = 'quitar')::int AS removals, max(created_at) AS last_at
       FROM attendance_log WHERE season_id = $1 GROUP BY actor_name ORDER BY marks DESC`,
      [req.params.id]
    ),
  ]);
  res.json({ log: log.rows.map((r) => ({ ...r, slot: r.slot.trim() })), summary: summary.rows });
});

// Carga o corrige el botín de una invasión (día + horario): las 8 categorías de una vez.
// Una cantidad en 0 borra el registro de esa categoría.
router.put('/:id/invasions/:day/:slot/loot', async (req, res) => {
  const { id, day, slot } = req.params;
  const quantities = req.body?.quantities;
  const season = await getSeason(id);
  if (!season) return res.status(404).json({ error: 'Temporada no encontrada' });
  if (!isDate(day) || !SLOTS.includes(slot)) return res.status(400).json({ error: 'Invasión inválida' });
  if (day < season.start_date || day > season.end_date) return res.status(400).json({ error: 'Ese día está fuera de la temporada' });
  if (!Array.isArray(quantities) || quantities.length !== 8 || !quantities.every((n) => Number.isInteger(n) && n >= 0 && n <= 1000000)) {
    return res.status(400).json({ error: 'Las cantidades deben ser 8 enteros entre 0 y 1 000 000' });
  }

  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');
    for (let category = 0; category < 8; category += 1) {
      const quantity = quantities[category];
      if (quantity > 0) {
        await client.query(
          `INSERT INTO season_loot (season_id, day, slot, category, quantity, created_by)
           VALUES ($1, $2, $3, $4, $5, $6)
           ON CONFLICT (season_id, day, slot, category) WHERE day IS NOT NULL
           DO UPDATE SET quantity = EXCLUDED.quantity, created_by = EXCLUDED.created_by, updated_at = now()`,
          [season.id, day, slot, category, quantity, req.user.id]
        );
      } else {
        await client.query('DELETE FROM season_loot WHERE season_id = $1 AND day = $2 AND slot = $3 AND category = $4', [
          season.id, day, slot, category,
        ]);
      }
    }
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
  res.status(204).end();
});

router.put('/:id/delivery', async (req, res) => {
  const { user_id, delivered } = req.body || {};
  if (!Number.isInteger(user_id)) return res.status(400).json({ error: 'Jugador inválido' });
  if (!(await getSeason(req.params.id))) return res.status(404).json({ error: 'Temporada no encontrada' });
  if (delivered) {
    await db.query('INSERT INTO season_delivery (season_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [req.params.id, user_id]);
  } else {
    await db.query('DELETE FROM season_delivery WHERE season_id = $1 AND user_id = $2', [req.params.id, user_id]);
  }
  res.status(204).end();
});

module.exports = router;
