const fs = require('fs');
const path = require('path');
const db = require('../src/db');

// Eventos de Smash MU que se cargan una sola vez, para poder editarlos desde el panel.
const DEFAULT_EVENTS = [
  ['Invasión Golden Dragon', 'Invasión', 'Lun - Dom', '12:00 · 17:00 · 21:00', '🐉'],
  ['Castle Siege', 'Guerra', 'Sábado', '21:30', '🏰'],
  ['Blood Castle', 'Evento', 'Diario', 'Cada 2h', '🩸'],
  ['Devil Square', 'Evento', 'Diario', 'Cada 2h', '😈'],
  ['Chaos Castle', 'Evento', 'Diario', 'Cada 3h', '⚔️'],
  ['Raid de Guild', 'Guild', 'Domingo', '22:00', '🔥'],
];

(async () => {
  const sql = fs.readFileSync(path.join(__dirname, '../db/schema.sql'), 'utf8');
  await db.query(sql);
  console.log('Esquema creado.');

  const done = await db.query("SELECT 1 FROM settings WHERE key = 'seed_events_done'");
  if (!done.rowCount) {
    const { rows } = await db.query('SELECT count(*)::int AS n FROM events');
    if (rows[0].n === 0) {
      for (const [name, tag, day, time, icon] of DEFAULT_EVENTS) {
        await db.query('INSERT INTO events (name, tag, day, time, icon) VALUES ($1, $2, $3, $4, $5)', [name, tag, day, time, icon]);
      }
      console.log('Eventos iniciales cargados.');
    }
    await db.query("INSERT INTO settings (key, value) VALUES ('seed_events_done', '1')");
  }
  await db.pool.end();
})().catch((e) => { console.error(e); process.exit(1); });
