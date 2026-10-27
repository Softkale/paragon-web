const express = require('express');
const smash = require('../lib/smash');

// Rankings y clanes de Smash MU (datos públicos del juego, servidos desde nuestra caché). Solo lectura, sin sesión.
//   GET /api/ranking/level                  top 100 por nivel
//   GET /api/ranking/gearscore              todos los personajes por GS (page, pageSize, q; by=name busca solo en nicks)
//   GET /api/ranking/guilds                 lista de clanes (q)
//   GET /api/ranking/guilds/:name           un clan con sus integrantes
//   GET /api/ranking/own-guild              nuestro clan (GUILD_NAME en .env, por defecto Paragon)
//   GET /api/ranking/character/:name        ficha y equipamiento de un personaje
//   GET /api/ranking/item/:file             imagen de un ítem (p. ej. 4-22.gif)
// Todas admiten ?realm=smash (por defecto) o ?realm=classic.
const router = express.Router();

const realmOf = (req) => (req.query.realm === 'classic' ? 'classic' : 'smash');
const intParam = (v, def, min, max) => Math.min(max, Math.max(min, Number.parseInt(v, 10) || def));
const matches = (q, ...fields) => !q || fields.some((f) => String(f || '').toLowerCase().includes(q));

// Si el origen no responde se avisa con 502 en vez de un error genérico del servidor.
const handler = (fn) => async (req, res) => {
  try {
    res.set('Cache-Control', 'public, max-age=60');
    await fn(req, res, realmOf(req));
  } catch (e) {
    console.error('[ranking]', e.message);
    res.status(502).json({ error: 'No se pudo consultar el ranking de Smash MU. Inténtalo de nuevo en unos minutos.' });
  }
};
const reply = (res, realm, body) => res.json({ realm, ownGuild: smash.ownGuild(), ...body });

router.get('/level', handler(async (_req, res, realm) => {
  reply(res, realm, { ranking: await smash.levelRanking(realm) });
}));

router.get('/gearscore', handler(async (req, res, realm) => {
  const q = String(req.query.q || '').trim().toLowerCase().slice(0, 40);
  const pageSize = intParam(req.query.pageSize, 50, 1, 200);
  const all = (await smash.characterIndex(realm)).map((c, i) => ({ rank: i + 1, ...c }));
  const rows = q ? all.filter((c) => (req.query.by === "name" ? matches(q, c.name) : matches(q, c.name, c.guild))) : all;
  const totalPages = Math.max(1, Math.ceil(rows.length / pageSize));
  const page = Math.min(intParam(req.query.page, 1, 1, 1e6), totalPages);
  reply(res, realm, { page, pageSize, total: rows.length, totalPages, ranking: rows.slice((page - 1) * pageSize, page * pageSize) });
}));

router.get('/guilds', handler(async (req, res, realm) => {
  const q = String(req.query.q || '').trim().toLowerCase().slice(0, 40);
  const list = (await smash.guilds(realm))
    .filter((g) => matches(q, g.name, g.master))
    .sort((a, b) => b.members - a.members || b.totalGearScore - a.totalGearScore || a.name.localeCompare(b.name));
  reply(res, realm, { total: list.length, guilds: list });
}));

async function sendGuild(res, realm, name) {
  const detail = name && name.length <= 32 ? await smash.guildDetail(realm, name) : null;
  if (!detail) return res.status(404).json({ error: 'Clan no encontrado' });
  return reply(res, realm, detail);
}

router.get('/guilds/:name', handler((req, res, realm) => sendGuild(res, realm, req.params.name)));
router.get('/own-guild', handler((_req, res, realm) => sendGuild(res, realm, smash.ownGuild())));

router.get('/character/:name', handler(async (req, res, realm) => {
  const name = req.params.name.trim();
  const character = name && name.length <= 20 ? await smash.profile(realm, name) : null;
  if (!character) return res.status(404).json({ error: 'Personaje no encontrado' });
  return reply(res, realm, { character });
}));

// Las imágenes casi no cambian: se dejan en la caché del navegador un día.
router.get('/item/:file', async (req, res) => {
  try {
    const img = await smash.itemImage(req.params.file);
    if (!img) return res.status(404).end();
    res.set({ 'Content-Type': 'image/gif', 'Cache-Control': 'public, max-age=86400' });
    return res.send(img);
  } catch (e) {
    console.error('[ranking]', e.message);
    return res.status(502).end();
  }
});

// Deja lista la caché de nuestro clan poco después de arrancar.
setTimeout(() => smash.warmOwnGuild(), 3000).unref();

module.exports = router;
