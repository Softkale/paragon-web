const express = require('express');
const db = require('../db');
const { requireAuth, requireRole } = require('../middleware/auth');

// CRUD de contenido público (eventos y noticias): lectura libre, escritura para oficial y admin.
// opts.optional: campos que pueden ir vacíos (por defecto solo `icon`). opts.numeric: enteros >= 0.
function contentRouter(table, fields, orderBy, opts = {}) {
  const optional = opts.optional || ['icon'];
  const numeric = opts.numeric || [];
  const router = express.Router();
  const cols = fields.join(', ');

  const pick = (body) => fields.map((f) => (body[f] === undefined ? null : body[f]));
  const valid = (body) => fields.every((f) => {
    if (optional.includes(f)) return true;
    if (numeric.includes(f)) return Number.isInteger(body[f]) && body[f] >= 0 && body[f] <= 9999999;
    return typeof body[f] === 'string' && body[f].trim();
  });

  router.get('/', async (_req, res) => {
    const { rows } = await db.query(`SELECT id, ${cols}, created_at FROM ${table} ORDER BY ${orderBy}`);
    res.json(rows);
  });

  router.post('/', requireAuth, requireRole('oficial'), async (req, res) => {
    if (!valid(req.body || {})) return res.status(400).json({ error: 'Faltan campos obligatorios' });
    const marks = fields.map((_, i) => `$${i + 1}`).join(', ');
    const { rows } = await db.query(
      `INSERT INTO ${table} (${cols}, created_by) VALUES (${marks}, $${fields.length + 1})
       RETURNING id, ${cols}, created_at`,
      [...pick(req.body), req.user.id]
    );
    res.status(201).json(rows[0]);
  });

  router.put('/:id', requireAuth, requireRole('oficial'), async (req, res) => {
    if (!valid(req.body || {})) return res.status(400).json({ error: 'Faltan campos obligatorios' });
    const sets = fields.map((f, i) => `${f} = $${i + 1}`).join(', ');
    const { rows } = await db.query(
      `UPDATE ${table} SET ${sets} WHERE id = $${fields.length + 1} RETURNING id, ${cols}, created_at`,
      [...pick(req.body), req.params.id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'No encontrado' });
    res.json(rows[0]);
  });

  router.delete('/:id', requireAuth, requireRole('oficial'), async (req, res) => {
    const { rowCount } = await db.query(`DELETE FROM ${table} WHERE id = $1`, [req.params.id]);
    if (!rowCount) return res.status(404).json({ error: 'No encontrado' });
    res.status(204).end();
  });

  return router;
}

module.exports = {
  events: contentRouter('events', ['name', 'tag', 'day', 'time', 'icon'], 'id'),
  news: contentRouter('news', ['title', 'body'], 'created_at DESC'),
  legends: contentRouter('legends', ['name', 'class_name', 'level', 'points', 'role'], 'points DESC, id', { numeric: ['level', 'points'] }),
};
