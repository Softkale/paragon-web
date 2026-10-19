const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../db');
const { requireAuth, requireRole } = require('../middleware/auth');
const { sendCredentials, generatePassword, isSmtpConfigured } = require('../mail/mailer');

const router = express.Router();
router.use(requireAuth, requireRole('oficial'));

const COLUMNS = 'id, character_name, email, character_class, role, status, created_at, must_change_password, invited_at, registered_at';

// El admin gestiona a todos; el oficial solo a miembros.
const canManage = (actor, targetRole) => actor.role === 'admin' || targetRole === 'miembro';

// Indica si el correo está configurado (para decidir si se ofrece enviar accesos por correo).
router.get('/mail-status', async (_req, res) => res.json({ configured: await isSmtpConfigured() }));

// Oficial y admin: listar miembros (opcionalmente por estado, p. ej. ?status=pendiente).
router.get('/', async (req, res) => {
  const { status } = req.query;
  const { rows } = status
    ? await db.query(`SELECT ${COLUMNS} FROM users WHERE status = $1 ORDER BY created_at DESC`, [status])
    : await db.query(`SELECT ${COLUMNS} FROM users ORDER BY created_at DESC`);
  res.json(rows);
});

// ---------- Alta e invitación ----------
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const mailInfo = (mail) => ({ sent: mail.sent, smtpConfigured: mail.smtpConfigured, error: mail.error || null });

// Normaliza y valida una fila de alta. Devuelve { row } o { error }.
function checkRow(raw, actor) {
  const row = {
    character_name: String(raw?.character_name ?? '').trim(),
    email: String(raw?.email ?? '').trim().toLowerCase(),
    character_class: String(raw?.character_class ?? '').trim() || null,
    role: String(raw?.role ?? '').trim().toLowerCase() || 'miembro',
  };
  if (!row.character_name) return { row, error: 'Falta el usuario' };
  if (row.character_name.length > 40) return { row, error: 'El usuario supera 40 caracteres' };
  if (!row.email) return { row, error: 'Falta el correo' };
  if (!EMAIL_RE.test(row.email) || row.email.length > 120) return { row, error: 'Correo inválido' };
  if (row.character_class && row.character_class.length > 40) return { row, error: 'La clase supera 40 caracteres' };
  if (!['miembro', 'oficial', 'admin'].includes(row.role)) return { row, error: 'Rol inválido (miembro, oficial o admin)' };
  if (row.role !== 'miembro' && actor.role !== 'admin') return { row, error: 'Solo el admin puede crear oficiales o administradores' };
  return { row };
}

// Crea el usuario con contraseña temporal. Lanza el error de la base si el usuario o correo ya existen.
async function insertInvited(row) {
  const password = generatePassword();
  const { rows } = await db.query(
    `INSERT INTO users (character_name, email, password_hash, character_class, role, status, must_change_password, invited_at)
     VALUES ($1, $2, $3, $4, $5, 'activo', true, now()) RETURNING ${COLUMNS}`,
    [row.character_name, row.email, await bcrypt.hash(password, 10), row.character_class, row.role]
  );
  return { user: rows[0], password };
}

// Alta directa: genera una contraseña temporal y la envía por correo.
router.post('/', async (req, res) => {
  const { row, error } = checkRow(req.body, req.user);
  if (error) return res.status(error.startsWith('Solo el admin') ? 403 : 400).json({ error });

  let created;
  try {
    created = await insertInvited(row);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Ese usuario o correo ya está registrado' });
    throw err;
  }
  // Sin correo (primer despliegue o SMTP sin configurar): la clave temporal se muestra una sola vez en pantalla.
  if (req.body?.sendEmail === false) {
    return res.status(201).json({
      user: created.user,
      temporaryPassword: created.password,
      email: { sent: false, skipped: true, smtpConfigured: await isSmtpConfigured(), error: null },
    });
  }
  const mail = await sendCredentials({ to: created.user.email, name: created.user.character_name, username: created.user.character_name, password: created.password });
  res.status(201).json({ user: created.user, email: mailInfo(mail) });
});

// Carga masiva (máx. 200 filas). Con ?dryRun=1 solo valida y no crea nada.
// Cada fila es independiente: las válidas se crean aunque otras fallen.
router.post('/bulk', async (req, res) => {
  const list = req.body?.users;
  const dryRun = req.query.dryRun === '1';
  if (!Array.isArray(list) || !list.length) return res.status(400).json({ error: 'No hay usuarios para cargar' });
  if (list.length > 200) return res.status(400).json({ error: 'Máximo 200 usuarios por carga' });

  const checked = list.map((raw) => checkRow(raw, req.user));

  // Duplicados dentro del archivo y contra la base de datos.
  const names = new Map();
  const emails = new Map();
  checked.forEach((c, i) => {
    if (c.error) return;
    const n = c.row.character_name.toLowerCase();
    if (names.has(n)) c.error = `Usuario repetido en el archivo (fila ${names.get(n) + 1})`;
    else if (emails.has(c.row.email)) c.error = `Correo repetido en el archivo (fila ${emails.get(c.row.email) + 1})`;
    names.set(n, names.get(n) ?? i);
    emails.set(c.row.email, emails.get(c.row.email) ?? i);
  });
  const candidates = checked.filter((c) => !c.error);
  if (candidates.length) {
    const existing = await db.query(
      'SELECT lower(character_name) AS n, email AS e FROM users WHERE lower(character_name) = ANY($1) OR email = ANY($2)',
      [candidates.map((c) => c.row.character_name.toLowerCase()), candidates.map((c) => c.row.email)]
    );
    const takenN = new Set(existing.rows.map((r) => r.n));
    const takenE = new Set(existing.rows.map((r) => r.e));
    candidates.forEach((c) => {
      if (takenN.has(c.row.character_name.toLowerCase())) c.error = 'Ese usuario ya existe';
      else if (takenE.has(c.row.email)) c.error = 'Ese correo ya está registrado';
    });
  }

  const results = checked.map((c, i) => ({ row: i + 1, name: c.row.character_name, email: c.row.email, role: c.row.role, ok: !c.error, error: c.error || null }));

  if (!dryRun) {
    const created = [];
    for (let i = 0; i < checked.length; i += 1) {
      if (checked[i].error) continue;
      try {
        created.push({ i, ...(await insertInvited(checked[i].row)) });
      } catch (err) {
        if (err.code !== '23505') throw err;
        results[i].ok = false;
        results[i].error = 'Ese usuario o correo ya está registrado';
      }
    }
    // Correos en lotes pequeños para no saturar el servidor SMTP.
    for (let k = 0; k < created.length; k += 5) {
      await Promise.all(created.slice(k, k + 5).map(async (c) => {
        const mail = await sendCredentials({ to: c.user.email, name: c.user.character_name, username: c.user.character_name, password: c.password });
        results[c.i].emailSent = mail.sent;
        results[c.i].emailError = mail.error || null;
      }));
    }
  }

  res.status(dryRun ? 200 : 201).json({
    dryRun,
    smtpConfigured: await isSmtpConfigured(),
    summary: {
      total: results.length,
      ok: results.filter((r) => r.ok).length,
      failed: results.filter((r) => !r.ok).length,
      emailsSent: results.filter((r) => r.emailSent).length,
      emailsFailed: results.filter((r) => r.ok && !dryRun && !r.emailSent).length,
    },
    results,
  });
});

// Regenera la contraseña temporal y reenvía los accesos.
async function reinvite(user, send = true) {
  const password = generatePassword();
  await db.query('UPDATE users SET password_hash = $1, must_change_password = true, invited_at = now() WHERE id = $2', [
    await bcrypt.hash(password, 10),
    user.id,
  ]);
  if (!send) return { password };
  return sendCredentials({ to: user.email, name: user.character_name, username: user.character_name, password, reset: true });
}

// Reenvía la invitación a todos los que aún no cambiaron su clave (nunca a los admins).
router.post('/resend-pending', async (req, res) => {
  const { rows } = await db.query(
    `SELECT id, character_name, email FROM users
     WHERE must_change_password AND status = 'activo' AND role <> 'admin' AND ($1 OR role = 'miembro')
     ORDER BY id`,
    [req.user.role === 'admin']
  );
  let sent = 0;
  let failed = 0;
  for (let k = 0; k < rows.length; k += 5) {
    await Promise.all(rows.slice(k, k + 5).map(async (u) => {
      const mail = await reinvite(u);
      if (mail.sent) sent += 1; else failed += 1;
    }));
  }
  res.json({ total: rows.length, sent, notSent: failed, smtpConfigured: await isSmtpConfigured() });
});

// Edita los datos de un usuario (usuario de acceso, correo y clase). El rol se cambia aparte.
router.patch('/:id', async (req, res) => {
  const target = await db.query('SELECT id, role FROM users WHERE id = $1', [req.params.id]);
  if (!target.rows[0]) return res.status(404).json({ error: 'Usuario no encontrado' });
  if (!canManage(req.user, target.rows[0].role)) return res.status(403).json({ error: 'No tienes permisos sobre este usuario' });

  const { row, error } = checkRow({ ...req.body, role: 'miembro' }, req.user); // el rol se cambia aparte
  if (error) return res.status(400).json({ error });

  try {
    const { rows } = await db.query(
      `UPDATE users SET character_name = $1, email = $2, character_class = $3 WHERE id = $4 RETURNING ${COLUMNS}`,
      [row.character_name, row.email, row.character_class, req.params.id]
    );
    res.json(rows[0]);
  } catch (err) {
    if (err.code !== '23505') throw err;
    const name = await db.query('SELECT 1 FROM users WHERE lower(character_name) = lower($1) AND id <> $2', [row.character_name, req.params.id]);
    res.status(409).json({ error: name.rowCount ? 'Ese usuario ya existe' : 'Ese correo ya está registrado' });
  }
});

router.post('/:id/reset-password', async (req, res) => {
  const target = await db.query('SELECT id, character_name, email, role FROM users WHERE id = $1', [req.params.id]);
  const user = target.rows[0];
  if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });
  if (!canManage(req.user, user.role)) return res.status(403).json({ error: 'No tienes permisos sobre este usuario' });
  if (req.body?.sendEmail === false) {
    const { password } = await reinvite(user, false);
    return res.json({ temporaryPassword: password, email: { sent: false, skipped: true, smtpConfigured: await isSmtpConfigured(), error: null } });
  }
  res.json({ email: mailInfo(await reinvite(user)) });
});

// Oficial y admin: aprobar o rechazar solicitudes y activar/desactivar miembros.
// Un oficial no puede tocar a otro oficial ni al admin.
router.patch('/:id/status', async (req, res) => {
  const { status } = req.body || {};
  if (!['activo', 'inactivo', 'rechazado'].includes(status)) {
    return res.status(400).json({ error: 'Estado inválido' });
  }
  const target = await db.query('SELECT role FROM users WHERE id = $1', [req.params.id]);
  if (!target.rows[0]) return res.status(404).json({ error: 'Usuario no encontrado' });
  if (target.rows[0].role === 'admin') {
    return res.status(403).json({ error: 'No se puede cambiar el estado de un admin' });
  }
  if (!canManage(req.user, target.rows[0].role)) {
    return res.status(403).json({ error: 'Solo el admin puede modificar a oficiales o al admin' });
  }
  const { rows } = await db.query(
    `UPDATE users SET status = $1 WHERE id = $2 RETURNING ${COLUMNS}`,
    [status, req.params.id]
  );
  res.json(rows[0]);
});

// Solo admin: cambiar el rol de cualquier usuario (miembro, oficial o admin), incluso bajar de rango a otro admin.
// No puede cambiarse el propio rol: así siempre queda al menos un admin activo.
router.patch('/:id/role', requireRole('admin'), async (req, res) => {
  const { role } = req.body || {};
  if (!['admin', 'oficial', 'miembro'].includes(role)) return res.status(400).json({ error: 'Rol inválido' });

  const id = Number(req.params.id);
  if (id === req.user.id) return res.status(400).json({ error: 'No puedes cambiar tu propio rol. Pídeselo a otro admin.' });

  const target = await db.query('SELECT id, status, role FROM users WHERE id = $1', [id]);
  const user = target.rows[0];
  if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });
  if (user.role === role) return res.status(400).json({ error: `Ya es ${role}` });
  if (role !== 'miembro' && user.status !== 'activo') {
    return res.status(400).json({ error: 'Solo se puede dar un rol con permisos a usuarios activos' });
  }

  const { rows } = await db.query(`UPDATE users SET role = $1 WHERE id = $2 RETURNING ${COLUMNS}`, [role, id]);
  res.json(rows[0]);
});

// Solo admin: eliminar usuario.
router.delete('/:id', requireRole('admin'), async (req, res) => {
  const { rowCount } = await db.query(`DELETE FROM users WHERE id = $1 AND role <> 'admin'`, [req.params.id]);
  if (!rowCount) return res.status(404).json({ error: 'Usuario no encontrado o es admin' });
  res.status(204).end();
});

module.exports = router;
