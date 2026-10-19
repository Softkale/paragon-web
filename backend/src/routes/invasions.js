const express = require('express');
const db = require('../db');
const { requireAuth, requireRole } = require('../middleware/auth');
const { SLOTS, getSettings, validTimezone, nowIn, slotState, seasonOn, localizeSlot } = require('../lib/schedule');
const { seasonEnd } = require('../lib/dates');

const router = express.Router();
router.use(requireAuth);

// Estado de las invasiones de hoy para el usuario que consulta.
router.get('/status', async (req, res) => {
  const settings = await getSettings();
  const now = nowIn(settings.timezone);
  const season = await seasonOn(now.day);

  const me = await db.query('SELECT timezone FROM users WHERE id = $1', [req.user.id]);
  const userTz = me.rows[0]?.timezone || settings.timezone;

  const [overrides, mine, total] = await Promise.all([
    db.query('SELECT slot, state FROM invasion_overrides WHERE day = $1', [now.day]),
    season
      ? db.query('SELECT day, slot FROM invasion_attendance WHERE season_id = $1 AND user_id = $2', [season.id, req.user.id])
      : { rows: [] },
    Promise.resolve(season ? SLOTS.length * 7 * season.weeks : 0),
  ]);
  const overrideOf = Object.fromEntries(overrides.rows.map((o) => [o.slot.trim(), o.state]));
  const checkedToday = new Set(mine.rows.filter((a) => a.day === now.day).map((a) => a.slot.trim()));

  res.json({
    now: { day: now.day, seconds: now.seconds },
    timezone: settings.timezone,
    userTimezone: me.rows[0]?.timezone || null,
    minutes: settings.checkin_minutes,
    season: season && { ...season, end_date: seasonEnd(season.start_date, season.weeks) },
    slots: SLOTS.map((slot) => ({
      slot,
      override: overrideOf[slot] || null,
      checked: checkedToday.has(slot),
      ...localizeSlot(now.day, slot, settings.timezone, userTz),
      ...slotState({ slot, minutes: settings.checkin_minutes, nowSeconds: now.seconds, override: overrideOf[slot] }),
    })),
    mine: { count: mine.rows.length, opportunities: total },
  });
});

// El miembro marca su propia asistencia, solo si la invasión está dentro de su ventana.
router.post('/checkin', async (req, res) => {
  const { slot } = req.body || {};
  if (!SLOTS.includes(slot)) return res.status(400).json({ error: 'Horario inválido' });

  const user = await db.query(`SELECT 1 FROM users WHERE id = $1 AND status = 'activo'`, [req.user.id]);
  if (!user.rowCount) return res.status(403).json({ error: 'Tu cuenta no está activa' });

  const settings = await getSettings();
  const now = nowIn(settings.timezone);
  const season = await seasonOn(now.day);
  if (!season) return res.status(409).json({ error: 'No hay una temporada vigente hoy' });

  const ov = await db.query('SELECT state FROM invasion_overrides WHERE day = $1 AND slot = $2', [now.day, slot]);
  const { state } = slotState({ slot, minutes: settings.checkin_minutes, nowSeconds: now.seconds, override: ov.rows[0]?.state });
  if (state === 'upcoming') return res.status(409).json({ error: 'Esta invasión aún no comienza' });
  if (state === 'closed') return res.status(409).json({ error: 'El tiempo para marcar esta invasión ya terminó' });

  const { rowCount } = await db.query(
    `INSERT INTO invasion_attendance (season_id, user_id, day, slot, source, marked_by)
     VALUES ($1, $2, $3, $4, 'self', $2) ON CONFLICT DO NOTHING`,
    [season.id, req.user.id, now.day, slot]
  );
  res.status(rowCount ? 201 : 200).json({ ok: true, alreadyChecked: !rowCount });
});

// ---------- Configuración (oficial y admin) ----------
router.get('/settings', requireRole('oficial'), async (_req, res) => res.json(await getSettings()));

router.put('/settings', requireRole('oficial'), async (req, res) => {
  const minutes = Number(req.body?.checkin_minutes);
  const { timezone } = req.body || {};
  if (!Number.isInteger(minutes) || minutes < 1 || minutes > 120) {
    return res.status(400).json({ error: 'La duración debe ser un entero entre 1 y 120 minutos' });
  }
  if (!validTimezone(timezone)) return res.status(400).json({ error: 'Zona horaria inválida (ej. America/Lima)' });

  const save = (key, value) =>
    db.query('INSERT INTO settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value', [key, String(value)]);
  await save('checkin_minutes', minutes);
  await save('timezone', timezone);
  res.json(await getSettings());
});

// Abre o cierra a mano la invasión de hoy en ese horario; state = null vuelve al horario normal.
router.put('/override', requireRole('oficial'), async (req, res) => {
  const { slot, state } = req.body || {};
  if (!SLOTS.includes(slot) || ![null, 'open', 'closed'].includes(state)) {
    return res.status(400).json({ error: 'Datos inválidos' });
  }
  const { day } = nowIn((await getSettings()).timezone);
  if (state === null) {
    await db.query('DELETE FROM invasion_overrides WHERE day = $1 AND slot = $2', [day, slot]);
  } else {
    await db.query(
      'INSERT INTO invasion_overrides (day, slot, state) VALUES ($1, $2, $3) ON CONFLICT (day, slot) DO UPDATE SET state = EXCLUDED.state',
      [day, slot, state]
    );
  }
  res.status(204).end();
});

module.exports = router;
