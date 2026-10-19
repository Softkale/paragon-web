require('./lib/bootstrap').ensureEnvFile(); // garantiza que exista backend/.env
require('dotenv').config({ path: require('./lib/bootstrap').ENV_PATH });
const { Pool, types } = require('pg');

// Las columnas DATE se devuelven como 'YYYY-MM-DD' (sin conversión de zona horaria).
types.setTypeParser(1082, (v) => v);

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

module.exports = { query: (text, params) => pool.query(text, params), pool };
