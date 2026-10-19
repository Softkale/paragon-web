const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../db');
const crypto = require('crypto');
const { requireSession } = require('../middleware/auth');
const { sendReset } = require('../mail/mailer');
const { createLimiter } = require('../lib/rateLimit');
const { validTimezone } = require('../lib/schedule');

const router = express.Router();

// `mcp` = debe cambiar la contraseña antes de usar el resto de la API.
const sign = (u) =>
  jwt.sign(
    { id: u.id, role: u.role, name: u.character_name, mcp: u.must_change_password },
    process.env.JWT_SECRET,
    { expiresIn: '8h' }
  );

const publicUser = (u) => ({
  id: u.id, name: u.character_name, role: u.role, mustChange: u.must_change_password, timezone: u.timezone || null,
});

// Fuerza bruta: tras 8 fallos con el mismo usuario desde la misma IP se bloquea 15 minutos.
const loginLimiter = createLimiter({ max: 8, windowMs: 15 * 60 * 1000 });

router.post('/login', async (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) return res.status(400).json({ error: 'Usuario y contraseña requeridos' });
  const limitKey = `${req.ip}|${String(username).trim().toLowerCase()}`;
  if (loginLimiter.isBlocked(limitKey)) return res.status(429).json({ error: 'Demasiados intentos fallidos. Espera 15 minutos o usa «¿Olvidaste tu contraseña?».' });

  const { rows } = await db.query('SELECT * FROM users WHERE lower(character_name) = lower($1)', [username.trim()]);
  const user = rows[0];
  const ok = user && (await bcrypt.compare(password, user.password_hash));
  if (!ok) {
    loginLimiter.fail(limitKey);
    return res.status(401).json({ error: 'Credenciales incorrectas' });
  }
  loginLimiter.clear(limitKey);

  if (user.status !== 'activo') {
    const msg = user.status === 'pendiente' ? 'Tu solicitud aún no ha sido aprobada' : 'Tu cuenta no está activa';
    return res.status(403).json({ error: msg });
  }
  res.json({ token: sign(user), user: publicUser(user) });
});

router.get('/me', requireSession, async (req, res) => {
  const { rows } = await db.query(
    'SELECT id, character_name, email, character_class, role, status, must_change_password, timezone FROM users WHERE id = $1',
    [req.user.id]
  );
  if (!rows[0]) return res.status(404).json({ error: 'Usuario no encontrado' });
  res.json(rows[0]);
});

// ---------- Recuperación de contraseña (autoservicio) ----------
const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');
const RESET_TTL_MIN = 60;
const RESET_COOLDOWN_MIN = 2;

// Límite por IP para frenar abusos: 15 intentos cada 15 minutos, contados por separado para
// pedir el enlace y para usarlo (varios miembros pueden compartir la misma conexión).
const buckets = { forgot: new Map(), reset: new Map() };
function tooMany(bucket, ip) {
  const now = Date.now();
  const hits = buckets[bucket];
  const recent = (hits.get(ip) || []).filter((t) => now - t < 15 * 60 * 1000);
  recent.push(now);
  hits.set(ip, recent);
  return recent.length > 15;
}

// Pide el enlace. La respuesta es siempre la misma exista o no la cuenta (no revela quién está registrado).
router.post('/forgot', async (req, res) => {
  if (tooMany('forgot', req.ip)) return res.status(429).json({ error: 'Demasiados intentos. Espera unos minutos.' });
  const reply = { message: 'Si la cuenta existe, te enviamos un correo con el enlace para restablecer tu contraseña.' };

  const id = String(req.body?.identifier ?? '').trim().slice(0, 120);
  if (!id) return res.status(400).json({ error: 'Escribe tu usuario o tu correo' });

  const { rows } = await db.query(
    "SELECT id, character_name, email FROM users WHERE (lower(character_name) = lower($1) OR email = lower($1)) AND status = 'activo' LIMIT 1",
    [id]
  );
  const user = rows[0];
  if (!user) return res.json(reply);

  const recent = await db.query(
    `SELECT 1 FROM password_resets WHERE user_id = $1 AND created_at > now() - make_interval(mins => $2) LIMIT 1`,
    [user.id, RESET_COOLDOWN_MIN]
  );
  if (recent.rowCount) return res.json(reply);

  const token = crypto.randomBytes(32).toString('hex');
  await db.query('DELETE FROM password_resets WHERE user_id = $1 AND used_at IS NULL', [user.id]); // invalida enlaces anteriores
  await db.query(
    `INSERT INTO password_resets (user_id, token_hash, expires_at) VALUES ($1, $2, now() + make_interval(mins => $3))`,
    [user.id, sha256(token), RESET_TTL_MIN]
  );
  await sendReset({ to: user.email, name: user.character_name, token });
  res.json(reply);
});

// Completa el restablecimiento con el enlace del correo.
router.post('/reset', async (req, res) => {
  if (tooMany('reset', req.ip)) return res.status(429).json({ error: 'Demasiados intentos. Espera unos minutos.' });
  const { token, password } = req.body || {};
  if (typeof token !== 'string' || !/^[a-f0-9]{64}$/.test(token)) return res.status(400).json({ error: 'El enlace no es válido o ya expiró. Solicita uno nuevo.' });
  if (typeof password !== 'string' || password.length < 8) return res.status(400).json({ error: 'La contraseña debe tener al menos 8 caracteres' });

  const found = await db.query(
    `SELECT r.id, r.user_id FROM password_resets r JOIN users u ON u.id = r.user_id
     WHERE r.token_hash = $1 AND r.used_at IS NULL AND r.expires_at > now() AND u.status = 'activo'`,
    [sha256(token)]
  );
  const row = found.rows[0];
  if (!row) return res.status(400).json({ error: 'El enlace no es válido o ya expiró. Solicita uno nuevo.' });

  await db.query(
    `UPDATE users SET password_hash = $1,
       registered_at = CASE WHEN must_change_password THEN now() ELSE registered_at END,
       must_change_password = false
     WHERE id = $2`,
    [await bcrypt.hash(password, 10), row.user_id]
  );
  await db.query('DELETE FROM password_resets WHERE user_id = $1', [row.user_id]); // el enlace queda gastado
  res.json({ message: 'Contraseña actualizada. Ya puedes iniciar sesión.' });
});

// Zona horaria propia: solo cambia cómo se le muestran los horarios. Vacío = hora de Perú.
router.put('/timezone', requireSession, async (req, res) => {
  const tz = req.body?.timezone || null;
  if (tz && !validTimezone(tz)) return res.status(400).json({ error: 'Zona horaria inválida' });
  await db.query('UPDATE users SET timezone = $1 WHERE id = $2', [tz, req.user.id]);
  res.json({ timezone: tz });
});

// Cambio de contraseña (obligatorio tras recibir una temporal). Devuelve una sesión nueva.
router.post('/change-password', requireSession, async (req, res) => {
  const { current_password, new_password } = req.body || {};
  if (!current_password || !new_password) return res.status(400).json({ error: 'Faltan datos' });
  if (new_password.length < 8) return res.status(400).json({ error: 'La nueva contraseña debe tener al menos 8 caracteres' });
  if (new_password === current_password) return res.status(400).json({ error: 'La nueva contraseña debe ser distinta a la actual' });

  const { rows } = await db.query('SELECT * FROM users WHERE id = $1', [req.user.id]);
  const user = rows[0];
  if (!user || !(await bcrypt.compare(current_password, user.password_hash))) {
    return res.status(401).json({ error: 'La contraseña actual es incorrecta' });
  }

  const hash = await bcrypt.hash(new_password, 10);
  const updated = await db.query(
    'UPDATE users SET password_hash = $1, registered_at = CASE WHEN must_change_password THEN now() ELSE registered_at END, must_change_password = false WHERE id = $2 RETURNING *',
    [hash, user.id]
  );
  res.json({ token: sign(updated.rows[0]), user: publicUser(updated.rows[0]) });
});

module.exports = router;
