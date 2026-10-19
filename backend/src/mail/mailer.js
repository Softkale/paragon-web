require('dotenv').config();
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const nodemailer = require('nodemailer');
const db = require('../db');
const { encrypt, decrypt } = require('../lib/secret');
const { credentialsEmail, testEmail, resetEmail } = require('./templates');

const LOGO = { filename: 'paragon.jpg', path: path.join(__dirname, '../../assets/logo.jpg'), cid: 'paragon-logo' };
const OUTBOX = path.join(__dirname, '../../outbox');

// Configuración de correo: lo guardado desde el panel manda sobre el archivo .env.
const KEYS = ['smtp_host', 'smtp_port', 'smtp_secure', 'smtp_user', 'smtp_pass', 'smtp_from', 'app_url'];

async function readConfig() {
  const { rows } = await db.query('SELECT key, value FROM settings WHERE key = ANY($1)', [KEYS]);
  const stored = Object.fromEntries(rows.map((r) => [r.key, r.value]));
  const pick = (key, envName, fallback = '') => (stored[key] !== undefined ? stored[key] : process.env[envName] ?? fallback);

  let pass = pick('smtp_pass', 'SMTP_PASS');
  let passError = null;
  if (stored.smtp_pass) {
    pass = decrypt(stored.smtp_pass);
    if (pass === null) { pass = ''; passError = 'No se pudo leer la contraseña guardada; vuelve a escribirla.'; }
  }
  return {
    host: pick('smtp_host', 'SMTP_HOST').trim(),
    port: Number(pick('smtp_port', 'SMTP_PORT', '587')) || 587,
    secure: String(pick('smtp_secure', 'SMTP_SECURE', 'false')) === 'true',
    user: pick('smtp_user', 'SMTP_USER').trim(),
    pass,
    passError,
    from: pick('smtp_from', 'SMTP_FROM').trim(),
    appUrl: (pick('app_url', 'APP_URL', 'http://localhost:5173') || 'http://localhost:5173').trim().replace(/\/$/, ''),
    source: KEYS.some((k) => stored[k] !== undefined) ? 'panel' : (process.env.SMTP_HOST ? 'env' : 'none'),
  };
}

const isSmtpConfigured = async () => !!(await readConfig()).host;

// Versión para mostrar en el panel: nunca incluye la contraseña.
async function getPublicConfig() {
  const c = await readConfig();
  return {
    host: c.host, port: c.port, secure: c.secure, user: c.user, from: c.from, appUrl: c.appUrl,
    passSet: !!c.pass, passError: c.passError, source: c.source, configured: !!c.host,
  };
}

// Guarda lo recibido. `pass` vacío/omitido conserva la actual; `clearPass` la borra.
async function saveConfig({ host, port, secure, user, pass, clearPass, from, appUrl }) {
  const save = (key, value) => db.query(
    'INSERT INTO settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value',
    [key, String(value)]
  );
  await save('smtp_host', host.trim());
  await save('smtp_port', port);
  await save('smtp_secure', secure ? 'true' : 'false');
  await save('smtp_user', user.trim());
  await save('smtp_from', from.trim());
  await save('app_url', appUrl.trim());
  if (clearPass) await save('smtp_pass', '');
  else if (pass) await save('smtp_pass', encrypt(pass));
}

let cached = { sig: '', transporter: null };
function transporterFor(c) {
  const sig = JSON.stringify([c.host, c.port, c.secure, c.user, c.pass]);
  if (cached.sig !== sig) {
    cached = {
      sig,
      transporter: nodemailer.createTransport({
        host: c.host, port: c.port, secure: c.secure,
        auth: c.user ? { user: c.user, pass: c.pass } : undefined,
        connectionTimeout: 10000, greetingTimeout: 10000, socketTimeout: 20000,
      }),
    };
  }
  return cached.transporter;
}

// Traduce los errores técnicos de SMTP a algo accionable.
function explainMailError(err) {
  const msg = String(err.message || err);
  if (err.code === 'EAUTH' || /Invalid login|authentication/i.test(msg)) return 'Usuario o contraseña SMTP incorrectos (en Gmail usa una «contraseña de aplicación»).';
  if (err.code === 'ECONNREFUSED' || /ECONNREFUSED/.test(msg)) return 'El servidor rechazó la conexión: revisa el host y el puerto.';
  if (err.code === 'ENOTFOUND' || err.code === 'EDNS' || /ENOTFOUND|EAI_AGAIN/.test(msg)) return 'No se encontró el servidor SMTP: revisa el host.';
  if (err.code === 'ETIMEDOUT' || err.code === 'ECONNECTION' || err.code === 'ESOCKET' || /ETIMEDOUT/.test(msg)) return 'No hubo respuesta del servidor: revisa host, puerto y la opción SSL/TLS (465 = activada, 587 = desactivada).';
  if (/wrong version number|ssl/i.test(msg)) return 'Error de SSL/TLS: prueba cambiar la opción «Conexión segura» (465 = activada, 587 = desactivada).';
  return msg;
}

// Contraseña temporal sin caracteres ambiguos (0/O, 1/l/I).
function generatePassword(length = 12) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
  return Array.from({ length }, () => chars[crypto.randomInt(chars.length)]).join('');
}

// Sin SMTP configurado, el correo se guarda en backend/outbox para revisarlo.
async function deliver({ to, subject, html, text }) {
  const c = await readConfig();
  if (!c.host) {
    fs.mkdirSync(OUTBOX, { recursive: true });
    const file = path.join(OUTBOX, `${Date.now()}-${to.replace(/[^\w.@-]/g, '_')}.html`);
    const inlineLogo = `data:image/jpeg;base64,${fs.readFileSync(LOGO.path).toString('base64')}`;
    fs.writeFileSync(file, html.replace('cid:paragon-logo', inlineLogo));
    console.log(`[mail] SMTP no configurado. Correo para ${to} guardado en ${file}`);
    return { sent: false, saved: file, smtpConfigured: false };
  }
  if (c.passError) throw new Error(c.passError);
  await transporterFor(c).sendMail({ from: c.from || c.user, to, subject, html, text, attachments: [LOGO] });
  return { sent: true, smtpConfigured: true };
}

// Envía los accesos. Nunca lanza: devuelve { sent, smtpConfigured, error } para que el alta no se pierda si falla el correo.
async function sendCredentials({ to, name, username, password, reset }) {
  const { appUrl } = await readConfig();
  const mail = credentialsEmail({ name, username, password, loginUrl: `${appUrl}/login`, reset });
  try {
    return await deliver({ to, ...mail });
  } catch (err) {
    console.error('[mail] Error al enviar:', err.message);
    return { sent: false, smtpConfigured: true, error: explainMailError(err) };
  }
}

// Correo de prueba para validar la configuración: aquí sí se devuelve el motivo del fallo.
async function sendTest(to) {
  const mail = testEmail();
  try {
    return await deliver({ to, ...mail });
  } catch (err) {
    return { sent: false, smtpConfigured: true, error: explainMailError(err) };
  }
}

// Envía el enlace para restablecer la contraseña. Nunca lanza.
async function sendReset({ to, name, token }) {
  const { appUrl } = await readConfig();
  const mail = resetEmail({ name, resetUrl: `${appUrl}/restablecer?token=${token}` });
  try {
    return await deliver({ to, ...mail });
  } catch (err) {
    console.error('[mail] Error al enviar el enlace de recuperación:', err.message);
    return { sent: false, smtpConfigured: true, error: explainMailError(err) };
  }
}

module.exports = { sendCredentials, sendReset, sendTest, generatePassword, isSmtpConfigured, getPublicConfig, saveConfig };
