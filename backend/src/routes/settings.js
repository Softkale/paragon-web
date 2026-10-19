const express = require('express');
const { requireAuth, requireRole } = require('../middleware/auth');
const { getPublicConfig, saveConfig, sendTest } = require('../mail/mailer');

// Configuración del sistema: solo el admin (incluye credenciales del correo).
const router = express.Router();
router.use(requireAuth, requireRole('admin'));

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

router.get('/mail', async (_req, res) => res.json(await getPublicConfig()));

router.put('/mail', async (req, res) => {
  const b = req.body || {};
  const host = String(b.host ?? '').trim();
  const port = Number(b.port);
  const from = String(b.from ?? '').trim();
  const appUrl = String(b.appUrl ?? '').trim();

  // Host vacío = correo desactivado (los mensajes se guardan en backend/outbox).
  if (host && (!Number.isInteger(port) || port < 1 || port > 65535)) return res.status(400).json({ error: 'Puerto inválido (1 a 65535)' });
  if (host && !/^[\w.-]+$/.test(host)) return res.status(400).json({ error: 'Servidor inválido (ej. smtp.gmail.com)' });
  if (host && !from) return res.status(400).json({ error: 'Indica el remitente (ej. PARAGON <no-reply@tudominio.com>)' });
  if (from && !EMAIL_RE.test(from.replace(/^.*<([^>]+)>.*$/, '$1'))) return res.status(400).json({ error: 'El remitente debe incluir un correo válido' });
  if (!/^https?:\/\/[^\s]+$/.test(appUrl)) return res.status(400).json({ error: 'La dirección de la web debe empezar con http:// o https://' });

  await saveConfig({
    host, port: host ? port : 587, secure: !!b.secure, user: String(b.user ?? ''), pass: b.pass ? String(b.pass) : '',
    clearPass: !!b.clearPass, from, appUrl,
  });
  res.json(await getPublicConfig());
});

// Envía un correo de prueba con la configuración guardada y devuelve el resultado real.
router.post('/mail/test', async (req, res) => {
  const to = String(req.body?.to ?? '').trim();
  if (!EMAIL_RE.test(to)) return res.status(400).json({ error: 'Escribe un correo válido para la prueba' });
  const result = await sendTest(to);
  res.json({ sent: result.sent, smtpConfigured: result.smtpConfigured, error: result.error || null });
});

module.exports = router;
