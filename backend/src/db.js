require('dotenv').config();
const { Pool, types } = require('pg');

// Las columnas DATE se devuelven como 'YYYY-MM-DD' (sin conversión de zona horaria).
types.setTypeParser(1082, (v) => v);

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

module.exports = { query: (text, params) => pool.query(text, params), pool };
