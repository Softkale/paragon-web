require('express-async-errors');
require('./lib/bootstrap').ensureEnvFile(); // si falta backend/.env lo crea (con un JWT_SECRET aleatorio)
require('dotenv').config({ path: require('./lib/bootstrap').ENV_PATH });
const fs = require('fs');
const path = require('path');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');

const isProd = process.env.NODE_ENV === 'production';

// Configuración mínima obligatoria: si falta algo, mejor no arrancar.
if (!process.env.DATABASE_URL) {
  console.error('Falta DATABASE_URL en .env');
  process.exit(1);
}
if (!process.env.JWT_SECRET) {
  console.error('Falta JWT_SECRET en .env');
  process.exit(1);
}
if (isProd && process.env.JWT_SECRET.length < 32) {
  console.error('En producción JWT_SECRET debe tener al menos 32 caracteres (genéralo con: openssl rand -hex 48)');
  process.exit(1);
}

const app = express();

// Detrás de nginx/Cloudflare hay que confiar en el proxy para ver la IP real (límites de intentos).
if (process.env.TRUST_PROXY) {
  const tp = process.env.TRUST_PROXY;
  app.set('trust proxy', tp === 'true' ? 1 : Number.isNaN(Number(tp)) ? tp : Number(tp));
}

app.use(helmet({
  contentSecurityPolicy: {
    useDefaults: false,
    directives: {
      'default-src': ["'self'"],
      'script-src': ["'self'"],
      'style-src': ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
      'font-src': ["'self'", 'https://fonts.gstatic.com'],
      'img-src': ["'self'", 'data:'],
      'connect-src': ["'self'"],
      'object-src': ["'none'"],
      'base-uri': ["'self'"],
      'frame-ancestors': ["'none'"],
    },
  },
  hsts: isProd, // solo tiene sentido con HTTPS real
}));

// En producción la web y la API salen del mismo origen: no hace falta CORS salvo que se pida.
const corsOrigin = process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(',').map((s) => s.trim()) : (isProd ? false : 'http://localhost:5173');
app.use(cors({ origin: corsOrigin }));
app.use(express.json({ limit: '1mb' }));

app.get('/api/health', (_req, res) => res.json({ ok: true }));
app.use('/api/auth', require('./routes/auth'));
app.use('/api/users', require('./routes/users'));
app.use('/api/seasons', require('./routes/seasons'));
app.use('/api/invasions', require('./routes/invasions'));
app.use('/api/reports', require('./routes/reports'));
app.use('/api/loot-reports', require('./routes/lootReports'));
const content = require('./routes/content');
app.use('/api/events', content.events);
app.use('/api/news', content.news);
app.use('/api/legends', content.legends);
app.use('/api/site', require('./routes/site'));
app.use('/api/settings', require('./routes/settings'));
app.use('/api', (_req, res) => res.status(404).json({ error: 'Ruta no encontrada' }));

// Sirve la web ya compilada (frontend/dist) desde este mismo servidor, con la ruta de respaldo de la SPA.
const dist = process.env.FRONTEND_DIST || path.join(__dirname, '../../frontend/dist');
if (fs.existsSync(path.join(dist, 'index.html'))) {
  app.use('/assets', express.static(path.join(dist, 'assets'), { immutable: true, maxAge: '1y' })); // archivos con hash
  app.use(express.static(dist, { index: false, maxAge: '1h' }));
  app.get('*', (_req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.sendFile(path.join(dist, 'index.html'));
  });
} else if (isProd) {
  console.warn(`[aviso] No se encontró la web compilada en ${dist}. Ejecuta "npm run build" en frontend/.`);
}

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: 'Error del servidor' });
});

// ---------- Arranque con puerto automático ----------
// Si el puerto preferido está ocupado, prueba con el siguiente libre. El puerto elegido se anota en backend/.port
// para que el entorno de desarrollo (Vite) y nginx (deploy/sync-nginx-port.sh) sepan dónde está. PORT_STRICT=true lo desactiva.
const preferred = Number(process.env.PORT) || 4000;
const host = process.env.HOST || undefined; // en un VPS detrás de nginx: HOST=127.0.0.1
const strict = process.env.PORT_STRICT === 'true';
const MAX_TRIES = 50;
const portFile = process.env.PORT_FILE || path.join(__dirname, '../.port');

let ownPort = null;

// Solo borra el archivo si el puerto anotado es el de ESTA instancia (otra puede haber tomado su lugar).
function removePortFile() {
  try {
    if (ownPort !== null && fs.readFileSync(portFile, 'utf8').trim() === String(ownPort)) fs.unlinkSync(portFile);
  } catch { /* ya no existe */ }
}

function start(port, tries = 0) {
  const server = app.listen(port, host);
  server.once('listening', () => {
    ownPort = port;
    fs.writeFileSync(portFile, String(port));
    if (port !== preferred) console.warn(`[aviso] El puerto ${preferred} estaba ocupado: se usa el ${port} (anotado en ${path.basename(portFile)}).`);
    console.log(`PARAGON en http://${host || 'localhost'}:${port} (${isProd ? 'producción' : 'desarrollo'})`);
  });
  server.once('error', (err) => {
    if (err.code === 'EADDRINUSE' && !strict && tries < MAX_TRIES) {
      console.warn(`Puerto ${port} en uso, probando el ${port + 1}…`);
      start(port + 1, tries + 1);
    } else {
      console.error(err.code === 'EADDRINUSE' ? `El puerto ${port} está en uso (PORT_STRICT activo o sin puertos libres).` : err);
      process.exit(1);
    }
  });
}

// Antes de escuchar, prepara todo lo necesario: crea la base de datos y las tablas si no existen
// (y el primer admin si se dio ADMIN_NAME / ADMIN_EMAIL). AUTO_INIT=false lo desactiva.
(async () => {
  if (process.env.AUTO_INIT !== 'false') await require('./lib/bootstrap').bootstrap();
  start(preferred);
})().catch((err) => {
  console.error(`No se pudo preparar la base de datos: ${err.message}`);
  process.exit(1);
});
['SIGINT', 'SIGTERM'].forEach((sig) => process.on(sig, () => { removePortFile(); process.exit(0); }));
process.on('exit', removePortFile);
