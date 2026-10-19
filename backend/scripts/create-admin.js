// Crea (o restablece) una cuenta de administrador SIN enviar correo. Pensado para el primer despliegue
// en un servidor nuevo, o para recuperar el acceso si nadie puede entrar.
//
//   npm run admin:create -- --name Kaizser --email correo@dominio.com
//   npm run admin:create -- --name Kaizser --email correo@dominio.com --password "MiClaveSegura1"
//   npm run admin:create -- --name Kaizser --email correo@dominio.com --reset     (si ya existe)
//
// Sin --password se genera una temporal y se muestra UNA vez; el admin deberá cambiarla al ingresar.
const bcrypt = require('bcryptjs');
const db = require('../src/db');
const { generatePassword } = require('../src/mail/mailer');

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

(async () => {
  const args = parseArgs(process.argv.slice(2));
  const name = String(args.name || process.env.ADMIN_NAME || '').trim();
  const email = String(args.email || process.env.ADMIN_EMAIL || '').trim().toLowerCase();
  const given = args.password && args.password !== true ? String(args.password) : process.env.ADMIN_PASSWORD || '';

  if (!name || !email) throw new Error('Uso: npm run admin:create -- --name <usuario> --email <correo> [--password <clave>] [--reset]');
  if (name.length > 40) throw new Error('El usuario admite hasta 40 caracteres');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('Correo inválido');
  if (given && given.length < 8) throw new Error('La contraseña debe tener al menos 8 caracteres');

  const password = given || generatePassword(14);
  const hash = await bcrypt.hash(password, 10);

  const existing = await db.query('SELECT id FROM users WHERE lower(character_name) = lower($1) OR email = $2', [name, email]);
  if (existing.rowCount) {
    if (!args.reset) throw new Error('Ya existe un usuario con ese nombre o correo. Agrega --reset para restablecer su clave y dejarlo como admin activo.');
    await db.query(
      `UPDATE users SET password_hash = $1, role = 'admin', status = 'activo', must_change_password = true, invited_at = now()
       WHERE id = $2`,
      [hash, existing.rows[0].id]
    );
    console.log('Cuenta existente restablecida como administrador.');
  } else {
    await db.query(
      `INSERT INTO users (character_name, email, password_hash, role, status, must_change_password, invited_at)
       VALUES ($1, $2, $3, 'admin', 'activo', true, now())`,
      [name, email, hash]
    );
    console.log('Administrador creado.');
  }

  console.log(`  Usuario:    ${name}`);
  console.log(`  Contraseña: ${password}   (temporal: se pedirá cambiarla al primer ingreso)`);
  await db.pool.end();
})().catch((e) => { console.error(`Error: ${e.message}`); process.exit(1); });
