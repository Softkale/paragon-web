// Preparación automática del entorno: archivo .env, base de datos, tablas y primer administrador.
// Se ejecuta al arrancar el servidor y desde los scripts (setup, init-db). Todo es seguro de repetir.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { Client } = require('pg');

const ENV_PATH = process.env.ENV_FILE || path.join(__dirname, '../../.env'); // ENV_FILE permite usar otro archivo (pruebas)
const DEFAULT_DATABASE_URL = 'postgres://postgres:postgres@localhost:5432/paragon';

// Eventos de Smash MU que se cargan una sola vez, para poder editarlos desde el panel.
const DEFAULT_EVENTS = [
  ['Invasión Golden Dragon', 'Invasión', 'Lun - Dom', '12:00 · 17:00 · 21:00', '🐉'],
  ['Castle Siege', 'Guerra', 'Sábado', '21:30', '🏰'],
  ['Blood Castle', 'Evento', 'Diario', 'Cada 2h', '🩸'],
  ['Devil Square', 'Evento', 'Diario', 'Cada 2h', '😈'],
  ['Chaos Castle', 'Evento', 'Diario', 'Cada 3h', '⚔️'],
  ['Raid de Guild', 'Guild', 'Domingo', '22:00', '🔥'],
];

// ---------- Archivo .env ----------
const readEnv = () => { try { return fs.readFileSync(ENV_PATH, 'utf8'); } catch { return null; } };
const hasKey = (text, key) => new RegExp(`^\\s*${key}\\s*=\\s*\\S`, 'm').test(text);

// Crea o actualiza una línea KEY=valor conservando el resto del archivo.
function upsertEnv(key, value) {
  const text = readEnv() || '';
  const line = `${key}=${value}`;
  const re = new RegExp(`^\\s*${key}\\s*=.*$`, 'm');
  const next = re.test(text) ? text.replace(re, () => line) : `${text}${text && !text.endsWith('\n') ? '\n' : ''}${line}\n`;
  fs.writeFileSync(ENV_PATH, next, { mode: 0o600 });
}

// Si falta backend/.env lo crea con un JWT_SECRET aleatorio; si existe pero le falta algo esencial, lo completa.
function ensureEnvFile() {
  const prod = process.env.NODE_ENV === 'production';
  const text = readEnv();

  if (text === null) {
    const lines = [
      '# Generado automáticamente en el primer arranque. Puedes editarlo.',
      ...(prod ? ['NODE_ENV=production', 'HOST=127.0.0.1', 'TRUST_PROXY=1'] : []),
      'PORT=4000',
      `DATABASE_URL=${process.env.DATABASE_URL || DEFAULT_DATABASE_URL}`,
      `JWT_SECRET=${crypto.randomBytes(48).toString('hex')}`,
      '',
    ];
    fs.writeFileSync(ENV_PATH, lines.join('\n'), { mode: 0o600 });
    console.log('[.env] No existía: se creó backend/.env con un JWT_SECRET aleatorio.');
    if (!process.env.DATABASE_URL) console.log('[.env] DATABASE_URL quedó con el valor por defecto; si tu PostgreSQL usa otra clave, ejecuta "npm run setup" o edítalo.');
    return;
  }

  try {
    if (!process.env.JWT_SECRET && !hasKey(text, 'JWT_SECRET')) {
      upsertEnv('JWT_SECRET', crypto.randomBytes(48).toString('hex'));
      console.log('[.env] Faltaba JWT_SECRET: se generó uno aleatorio.');
    }
    if (!process.env.DATABASE_URL && !hasKey(text, 'DATABASE_URL')) {
      upsertEnv('DATABASE_URL', DEFAULT_DATABASE_URL);
      console.log('[.env] Faltaba DATABASE_URL: se agregó el valor por defecto.');
    }
  } catch {
    /* sin permiso de escritura (p. ej. .env de root en el VPS): se usan las variables que aporte systemd */
  }
}

// ---------- Base de datos ----------
const quoteIdent = (s) => `"${s.replace(/"/g, '""')}"`;

async function connect(connectionString) {
  const client = new Client({ connectionString });
  await client.connect();
  return client;
}

function withDatabase(url, database) {
  const u = new URL(url);
  u.pathname = `/${database}`;
  return u.toString();
}

function manualHelp(dbName, role) {
  return [
    'Puedes resolverlo de una de estas formas:',
    '  1) Ejecutar el asistente:             npm run setup',
    `  2) Crearla tú con un administrador:   su - postgres -c "psql -c \\"CREATE DATABASE ${dbName} OWNER ${role}\\""`,
    '  3) Darle permiso al usuario:          ALTER ROLE <usuario> CREATEDB;   y volver a arrancar',
    '  4) Pasar un administrador:            PG_ADMIN_URL=postgres://postgres:CLAVE@localhost:5432/postgres npm run db:init',
  ].join('\n');
}

// Crea la base (y el usuario, si se dispone de un administrador) cuando no existen. Nunca borra nada.
// Necesita que el usuario de DATABASE_URL tenga CREATEDB, o una conexión de administrador en PG_ADMIN_URL.
async function ensureDatabase({ log = console.log } = {}) {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('Falta DATABASE_URL en backend/.env');
  const parsed = new URL(url);
  const dbName = decodeURIComponent(parsed.pathname.slice(1));
  const role = decodeURIComponent(parsed.username);
  const rolePass = decodeURIComponent(parsed.password);
  if (!/^[A-Za-z0-9_]+$/.test(dbName)) throw new Error('El nombre de la base (en DATABASE_URL) solo puede tener letras, números y guion bajo');
  const adminUrl = process.env.PG_ADMIN_URL;

  let failure;
  try {
    (await connect(url)).end();
    return false; // ya se puede conectar: no hay nada que crear
  } catch (err) {
    failure = err;
  }

  const missingDb = failure.code === '3D000';
  const badRole = failure.code === '28P01' || failure.code === '28000';
  if (!missingDb && !(badRole && adminUrl)) {
    const hint = badRole ? ' Revisa el usuario y la clave de DATABASE_URL en backend/.env, o ejecuta "npm run setup".' : '';
    throw new Error(`No se pudo conectar a PostgreSQL (${failure.code || failure.message}).${hint}`);
  }

  let admin;
  try {
    admin = await connect(adminUrl || withDatabase(url, 'postgres'));
  } catch (err) {
    throw new Error(`No se pudo conectar como administrador para crear la base: ${err.message}\n${manualHelp(dbName, role)}`);
  }

  try {
    if (adminUrl) {
      const exists = await admin.query('SELECT 1 FROM pg_roles WHERE rolname = $1', [role]);
      if (!exists.rowCount) {
        await admin.query(`CREATE ROLE ${quoteIdent(role)} LOGIN PASSWORD ${admin.escapeLiteral(rolePass)}`);
        log(`Usuario de base de datos «${role}» creado.`);
      } else if (badRole) {
        await admin.query(`ALTER ROLE ${quoteIdent(role)} LOGIN PASSWORD ${admin.escapeLiteral(rolePass)}`);
        log(`Clave del usuario «${role}» ajustada a la de DATABASE_URL.`);
      }
    }
    const found = await admin.query('SELECT 1 FROM pg_database WHERE datname = $1', [dbName]);
    if (!found.rowCount) {
      try {
        await admin.query(`CREATE DATABASE ${quoteIdent(dbName)} ENCODING 'UTF8'${adminUrl ? ` OWNER ${quoteIdent(role)}` : ''}`);
      } catch (err) {
        if (err.code === '42501') throw new Error(`El usuario «${role}» no tiene permiso para crear bases de datos.\n${manualHelp(dbName, role)}`);
        throw err;
      }
      log(`Base de datos «${dbName}» creada.`);
    }
  } finally {
    await admin.end();
  }
  return true;
}

// Crea (o actualiza) las tablas y carga los eventos iniciales una sola vez.
async function initSchema({ log = console.log } = {}) {
  const db = require('../db');
  await db.query(fs.readFileSync(path.join(__dirname, '../../db/schema.sql'), 'utf8'));

  const done = await db.query("SELECT 1 FROM settings WHERE key = 'seed_events_done'");
  if (!done.rowCount) {
    const { rows } = await db.query('SELECT count(*)::int AS n FROM events');
    if (rows[0].n === 0) {
      for (const [name, tag, day, time, icon] of DEFAULT_EVENTS) {
        await db.query('INSERT INTO events (name, tag, day, time, icon) VALUES ($1, $2, $3, $4, $5)', [name, tag, day, time, icon]);
      }
      log('Eventos iniciales cargados.');
    }
    await db.query("INSERT INTO settings (key, value) VALUES ('seed_events_done', '1')");
  }
}

// ---------- Primer administrador ----------
async function createAdmin({ name, email, password }) {
  const bcrypt = require('bcryptjs');
  const db = require('../db');
  const { generatePassword } = require('../mail/mailer');
  const finalPassword = password || generatePassword(14);
  await db.query(
    `INSERT INTO users (character_name, email, password_hash, role, status, must_change_password, invited_at)
     VALUES ($1, lower($2), $3, 'admin', 'activo', true, now())`,
    [name, email, await bcrypt.hash(finalPassword, 10)]
  );
  return finalPassword;
}

// Si todavía no hay ningún admin y se dieron ADMIN_NAME / ADMIN_EMAIL (en .env o en el entorno), lo crea sin correo.
async function ensureFirstAdmin({ log = console.log } = {}) {
  const db = require('../db');
  const { rows } = await db.query("SELECT count(*)::int AS n FROM users WHERE role = 'admin'");
  if (rows[0].n > 0) return;

  const name = (process.env.ADMIN_NAME || '').trim();
  const email = (process.env.ADMIN_EMAIL || '').trim();
  if (!name || !email) {
    log('[aviso] Todavía no hay ningún administrador. Crea el primero con:');
    log('        npm run admin:create -- --name TuUsuario --email tucorreo@dominio.com');
    return;
  }
  const password = await createAdmin({ name, email, password: process.env.ADMIN_PASSWORD || '' });
  log('Primer administrador creado (sin correo):');
  log(`  Usuario:    ${name}`);
  log(`  Contraseña: ${process.env.ADMIN_PASSWORD ? '(la indicada en ADMIN_PASSWORD)' : password}   (temporal: deberá cambiarla al primer ingreso)`);
  if (process.env.ADMIN_PASSWORD) log('  Borra ADMIN_PASSWORD del .env cuando ya hayas entrado.');
}

// Todo lo necesario para que la aplicación pueda arrancar: base, tablas y (si se pidió) primer admin.
async function bootstrap(options) {
  await ensureDatabase(options);
  await initSchema(options);
  await ensureFirstAdmin(options);
}

module.exports = { ensureEnvFile, upsertEnv, readEnv, ENV_PATH, ensureDatabase, initSchema, createAdmin, ensureFirstAdmin, bootstrap };
