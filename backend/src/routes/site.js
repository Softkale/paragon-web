const express = require('express');
const db = require('../db');
const { requireAuth, requireRole } = require('../middleware/auth');

// Textos y cifras editables de la portada. Lectura pública; edición para oficial y admin.
const router = express.Router();

// campo -> [texto por defecto, largo máximo]
const TEXT_FIELDS = {
  hero_kicker: ['Guild de Smash MU', 60],
  hero_title: ['PARAGON', 30],
  hero_subtitle: ['Forjados en fuego. Unidos en cada invasión.', 140],
  hero_primary: ['Únete a la guild', 30],
  hero_secondary: ['Ver eventos', 30],
  events_title: ['Eventos e invasiones', 60],
  ranking_title: ['Salón de leyendas', 60],
  news_title: ['Últimas noticias', 60],
  cta_title: ['¿Quieres unirte a PARAGON?', 80],
  cta_text: ['Habla con un oficial de la guild para que te den acceso.', 200],
  cta_button: ['Contactar', 30],
  footer_text: ['Guild de Smash MU. Forjados en fuego.', 120],
};
const MAX_STATS = 6;
const KEY = 'site_content';

const defaults = () => ({
  ...Object.fromEntries(Object.entries(TEXT_FIELDS).map(([k, [v]]) => [k, v])),
  cta_url: '', // enlace del botón (Discord, WhatsApp...). Vacío = no se muestra la llamada final
  stats: [], // sin cifras de ejemplo: se muestran solo las que se carguen
});

async function load() {
  const { rows } = await db.query('SELECT value FROM settings WHERE key = $1', [KEY]);
  let stored = {};
  try { stored = rows[0] ? JSON.parse(rows[0].value) : {}; } catch { /* contenido dañado: usa los valores por defecto */ }
  return { ...defaults(), ...stored };
}

router.get('/', async (_req, res) => res.json(await load()));

router.put('/', requireAuth, requireRole('oficial'), async (req, res) => {
  const body = req.body || {};
  const next = {};
  for (const [field, [, max]] of Object.entries(TEXT_FIELDS)) {
    const v = body[field];
    if (typeof v !== 'string' || !v.trim()) return res.status(400).json({ error: `El campo «${field}» no puede estar vacío` });
    if (v.length > max) return res.status(400).json({ error: `El campo «${field}» admite hasta ${max} caracteres` });
    next[field] = v.trim();
  }

  // Enlace opcional del botón de contacto. Vacío oculta la llamada final y el botón de la portada.
  const ctaUrl = String(body.cta_url ?? '').trim();
  if (ctaUrl && (ctaUrl.length > 300 || !/^(https?:\/\/|mailto:)\S+$/i.test(ctaUrl))) {
    return res.status(400).json({ error: 'El enlace debe empezar con https://, http:// o mailto:' });
  }
  next.cta_url = ctaUrl;

  const stats = Array.isArray(body.stats) ? body.stats : [];
  if (stats.length > MAX_STATS) return res.status(400).json({ error: `Máximo ${MAX_STATS} cifras` });
  next.stats = [];
  for (const s of stats) {
    const label = String(s?.label ?? '').trim();
    const value = Number(s?.value);
    const suffix = String(s?.suffix ?? '').trim();
    if (!label || label.length > 30) return res.status(400).json({ error: 'Cada cifra necesita un nombre de hasta 30 caracteres' });
    if (!Number.isInteger(value) || value < 0 || value > 9999999) return res.status(400).json({ error: `«${label}»: el valor debe ser un entero entre 0 y 9 999 999` });
    if (suffix.length > 3) return res.status(400).json({ error: `«${label}»: el sufijo admite hasta 3 caracteres (ej. +)` });
    next.stats.push({ label, value, suffix });
  }

  await db.query(
    'INSERT INTO settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value',
    [KEY, JSON.stringify(next)]
  );
  res.json(await load());
});

// Vuelve a los textos originales.
router.delete('/', requireAuth, requireRole('oficial'), async (_req, res) => {
  await db.query('DELETE FROM settings WHERE key = $1', [KEY]);
  res.json(await load());
});

module.exports = router;
