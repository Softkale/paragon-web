// Prepara la base de datos: la CREA si no existe, crea las tablas y carga los eventos iniciales.
// Es seguro repetirlo. (El servidor ya hace esto solo al arrancar; este comando sirve para hacerlo a mano.)
//
// Crear la base necesita que el usuario de DATABASE_URL tenga permiso CREATEDB, o una conexión de administrador:
//   PG_ADMIN_URL=postgres://postgres:CLAVE@localhost:5432/postgres npm run db:init
// (con PG_ADMIN_URL también se crea el usuario de DATABASE_URL si no existe; no se guarda en ningún lado).
require('../src/lib/bootstrap').ensureEnvFile();
require('dotenv').config({ path: require('../src/lib/bootstrap').ENV_PATH });
const { ensureDatabase, initSchema, ensureFirstAdmin } = require('../src/lib/bootstrap');

(async () => {
  await ensureDatabase();
  await initSchema();
  console.log('Tablas listas.');
  await ensureFirstAdmin();
  await require('../src/db').pool.end();
  console.log('Base de datos lista.');
})().catch((e) => { console.error(`Error: ${e.message}`); process.exit(1); });
