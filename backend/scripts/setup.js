// Asistente de instalación: deja TODO listo de una vez.
//   1) crea backend/.env (con un JWT_SECRET aleatorio) si no existe,
//   2) crea el usuario y la base de datos de PostgreSQL,
//   3) crea las tablas y los eventos iniciales,
//   4) crea el primer administrador (sin correo).
//
// Uso:
//   npm run setup                       (pregunta lo necesario)
//   npm run setup -- --production       (en un servidor: HOST=127.0.0.1, TRUST_PROXY=1, NODE_ENV=production)
//
// Para crear el usuario y la base necesita un administrador de PostgreSQL. Lo obtiene, en este orden:
//   a) --admin-url postgres://postgres:CLAVE@localhost:5432/postgres   (o la variable PG_ADMIN_URL)
//   b) en Linux ejecutándolo como root con PostgreSQL local: usa el usuario del sistema «postgres» (sin clave)
//   c) preguntándote la clave del usuario «postgres»
//
// Opciones para no usar preguntas (--yes): --db-name --db-user --db-pass --host --port --admin-name --admin-email [--admin-password]
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const readline = require('readline');
const { execFileSync, spawnSync } = require('child_process');

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 1) {
    if (!argv[i].startsWith('--')) continue;
    const key = argv[i].slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith('--')) out[key] = true;
    else { out[key] = next; i += 1; }
  }
  return out;
}

// Si todavía no se instalaron las dependencias (npm ci / npm install), las instala aquí mismo.
function ensureDependencies() {
  const backendDir = path.join(__dirname, '..');
  if (fs.existsSync(path.join(backendDir, 'node_modules', 'pg'))) return;
  const cmd = fs.existsSync(path.join(backendDir, 'package-lock.json')) ? 'ci' : 'install';
  console.log(`Faltan las dependencias del backend: instalándolas (npm ${cmd} --omit=dev)…\n\n`);
  const r = spawnSync('npm', [cmd, '--omit=dev', '--no-audit', '--no-fund'], { cwd: backendDir, stdio: 'inherit', shell: process.platform === 'win32' });
  if (r.status !== 0) {
    console.error('\nNo se pudieron instalar las dependencias. Ejecuta manualmente en backend/:  npm ci --omit=dev');
    process.exit(1);
  }
  console.log('');
}
ensureDependencies();

const args = parseArgs(process.argv.slice(2));
const production = !!args.production || process.env.NODE_ENV === 'production';
if (production) process.env.NODE_ENV = 'production'; // para que el .env nuevo salga con la configuración de servidor

const bootstrap = require('../src/lib/bootstrap');

const interactive = !args.yes && (process.stdin.isTTY || !!args.interactive);
let rl;
let closed = false;
const queue = []; // respuestas que llegan por entrada redirigida antes de que se haga la pregunta
let waiter = null;

function openPrompt() {
  rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: !!process.stdin.isTTY });
  rl.on('close', () => { closed = true; if (waiter) { const w = waiter; waiter = null; w(null); } });
  if (!process.stdin.isTTY) {
    rl.on('line', (line) => { if (waiter) { const w = waiter; waiter = null; w(line); } else queue.push(line); });
  }
  // Permite ocultar lo que se escribe (claves) cuando hay terminal.
  const original = rl._writeToOutput;
  rl._writeToOutput = function write(str) { if (this.muted) { if (str.includes('\n')) process.stdout.write('\n'); } else original.call(this, str); };
}

function ask(question, { def = '', hidden = false } = {}) {
  if (!interactive) return Promise.resolve(def);
  if (!rl) openPrompt();
  process.stdout.write(`${question}${def ? ` [${def}]` : ''}: `);
  const finish = (answer) => (answer === null ? def : (answer.trim() || def));

  if (!process.stdin.isTTY) { // entrada redirigida: toma la siguiente línea de la cola
    if (queue.length) return Promise.resolve(finish(queue.shift()));
    if (closed) return Promise.resolve(def);
    return new Promise((resolve) => { waiter = (line) => { if (line !== null) process.stdout.write('\n'); resolve(finish(line)); }; });
  }
  return new Promise((resolve) => { // terminal real
    if (closed) return resolve(def);
    if (hidden) rl.muted = true;
    rl.question('', (answer) => { rl.muted = false; resolve(finish(answer)); });
  });
}

const enc = encodeURIComponent;
const validIdent = (s) => /^[A-Za-z0-9_]+$/.test(s);
const sqlLit = (s) => `'${String(s).replace(/'/g, "''")}'`;

function commandExists(cmd) {
  try { execFileSync('sh', ['-c', `command -v ${cmd}`], { stdio: 'ignore' }); return true; } catch { return false; }
}
const canUsePeer = () => process.platform === 'linux' && typeof process.getuid === 'function' && process.getuid() === 0 && commandExists('psql') && commandExists('runuser');

// Crea el usuario y la base usando el usuario del sistema «postgres» (autenticación local, sin clave).
function createViaPeer({ db, role, pass }) {
  const psql = (sql) => execFileSync('runuser', ['-u', 'postgres', '--', 'psql', '-v', 'ON_ERROR_STOP=1', '-tA', '-c', sql], { encoding: 'utf8' }).trim();
  if (psql(`SELECT 1 FROM pg_roles WHERE rolname = ${sqlLit(role)}`)) psql(`ALTER ROLE "${role}" LOGIN PASSWORD ${sqlLit(pass)}`);
  else psql(`CREATE ROLE "${role}" LOGIN PASSWORD ${sqlLit(pass)}`);
  if (!psql(`SELECT 1 FROM pg_database WHERE datname = ${sqlLit(db)}`)) psql(`CREATE DATABASE "${db}" OWNER "${role}" ENCODING 'UTF8'`);
}

async function canConnect(url) {
  const { Client } = require('pg');
  const client = new Client({ connectionString: url });
  try { await client.connect(); await client.end(); return true; } catch { return false; }
}

// Si la base ya está accesible no se toca nada; si no, se crea el usuario y la base y se escribe DATABASE_URL.
async function provisionDatabase() {
  // ¿Ya funciona (o solo falta crear la base con los datos actuales)?
  try {
    await bootstrap.ensureDatabase();
    console.log('✓ Base de datos: ya configurada y accesible.');
    return;
  } catch { /* hay que crearla desde cero */ }

  console.log('\n→ Creando el usuario y la base de datos de PostgreSQL…');
  let host = args.host || 'localhost';
  let port = args.port || '5432';
  try { const u = new URL(process.env.DATABASE_URL); host = args.host || u.hostname; port = args.port || u.port || '5432'; } catch { /* usa los valores por defecto */ }

  const db = String(args['db-name'] || (await ask('Nombre de la base de datos', { def: 'paragon' })));
  const role = String(args['db-user'] || (await ask('Usuario de la aplicación en PostgreSQL', { def: 'paragon' })));
  const pass = String(args['db-pass'] || crypto.randomBytes(18).toString('base64url').replace(/[-_]/g, 'x')); // sin símbolos conflictivos
  if (!validIdent(db) || !validIdent(role)) throw new Error('El nombre de la base y del usuario solo pueden tener letras, números y guion bajo');
  const newUrl = `postgres://${enc(role)}:${enc(pass)}@${host}:${port}/${db}`;

  let adminUrl = args['admin-url'] || process.env.PG_ADMIN_URL;
  if (adminUrl) {
    process.env.PG_ADMIN_URL = String(adminUrl);
    process.env.DATABASE_URL = newUrl;
    await bootstrap.ensureDatabase();
  } else if (canUsePeer()) {
    console.log('  (usando el usuario del sistema «postgres», sin clave)');
    createViaPeer({ db, role, pass });
    process.env.DATABASE_URL = newUrl;
  } else if (interactive) {
    const adminUser = await ask('Usuario administrador de PostgreSQL', { def: 'postgres' });
    const adminPass = await ask(`Contraseña de «${adminUser}»`, { hidden: true });
    adminUrl = `postgres://${enc(adminUser)}:${enc(adminPass)}@${host}:${port}/postgres`;
    process.env.PG_ADMIN_URL = adminUrl;
    process.env.DATABASE_URL = newUrl;
    await bootstrap.ensureDatabase();
  } else {
    throw new Error('Para crear el usuario y la base hace falta un administrador de PostgreSQL. Pásalo así:\n'
      + '  npm run setup -- --yes --admin-url postgres://postgres:CLAVE@localhost:5432/postgres\n'
      + 'o ejecuta el asistente en una terminal normal (te preguntará la clave), o como root en el servidor.');
  }
  delete process.env.PG_ADMIN_URL; // la conexión de administrador nunca se guarda
  bootstrap.upsertEnv('DATABASE_URL', newUrl);
  console.log(`✓ Base «${db}» lista. DATABASE_URL guardada en ${path.basename(bootstrap.ENV_PATH)} (usuario «${role}», clave generada).`);
}

async function firstAdmin() {
  const dbmod = require('../src/db');
  const { rows } = await dbmod.query("SELECT count(*)::int AS n FROM users WHERE role = 'admin'");
  if (rows[0].n > 0) { console.log('✓ Administrador: ya existe al menos uno.'); return; }

  console.log('\n→ Primer administrador (se crea SIN enviar correo)');
  const name = String(args['admin-name'] || process.env.ADMIN_NAME || (await ask('Usuario del administrador')));
  const email = String(args['admin-email'] || process.env.ADMIN_EMAIL || (await ask('Correo del administrador')));
  if (!name || !email) {
    console.log('  Omitido. Créalo después con:  npm run admin:create -- --name TuUsuario --email tucorreo@dominio.com');
    return;
  }
  if (name.length > 40 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('Usuario (máx. 40 caracteres) o correo inválido');
  const given = args['admin-password'] && args['admin-password'] !== true ? String(args['admin-password']) : process.env.ADMIN_PASSWORD || '';
  if (given && given.length < 8) throw new Error('La contraseña del administrador debe tener al menos 8 caracteres');
  const password = await bootstrap.createAdmin({ name, email, password: given });
  console.log(`✓ Administrador creado.\n    Usuario:    ${name}\n    Contraseña: ${given ? '(la que indicaste)' : password}   (temporal: se pedirá cambiarla al primer ingreso)`);
}

// En un servidor, si se ejecutó como root, el .env debe quedar a nombre del dueño del proyecto (el usuario del servicio).
function fixOwnership() {
  if (process.platform !== 'linux' || typeof process.getuid !== 'function' || process.getuid() !== 0) return;
  try {
    const owner = fs.statSync(path.join(__dirname, '..'));
    fs.chownSync(bootstrap.ENV_PATH, owner.uid, owner.gid);
    fs.chmodSync(bootstrap.ENV_PATH, 0o600);
  } catch { /* no crítico */ }
}

(async () => {
  console.log(`PARAGON · asistente de instalación (${production ? 'servidor' : 'desarrollo'})\n`);

  bootstrap.ensureEnvFile();
  require('dotenv').config({ path: bootstrap.ENV_PATH });
  console.log(`✓ Configuración: ${path.basename(bootstrap.ENV_PATH)} listo (JWT_SECRET generado automáticamente).`);

  await provisionDatabase();

  await bootstrap.initSchema();
  console.log('✓ Tablas y eventos iniciales listos.');

  await firstAdmin();
  fixOwnership();
  await require('../src/db').pool.end();
  if (rl) rl.close();

  console.log('\nListo. Siguientes pasos:');
  console.log(production
    ? '  systemctl enable --now paragon      (o: npm start)'
    : '  npm run dev      y en otra terminal:  cd ../frontend && npm run dev');
})().catch((e) => {
  console.error(`\nError: ${e.message}`);
  if (rl) rl.close();
  process.exit(1);
});
