// Cliente de la API pública de Smash MU (rankings, clanes y perfiles) con caché en memoria.
// La web oficial publica estos datos sin autenticación; aquí se consultan con pocas peticiones, se guardan unos
// minutos y, si el origen falla, se sigue sirviendo el último dato bueno.
const REALMS = { smash: '_obj2', classic: '_obj' };
const MAX_MEMBERS = 100; // tope de integrantes enriquecidos por clan (limita las peticiones de perfil)
const INDEX_PAGE = 5000; // máximo que acepta el origen por página

const base = () => (process.env.SMASH_API_BASE || 'https://www.smashmu.com').replace(/\/+$/, '');
const ownGuild = () => process.env.GUILD_NAME || 'Paragon';

const CLASS_NAMES = {
  0: 'Dark Wizard', 1: 'Soul Master', 2: 'Grand Master',
  16: 'Dark Knight', 17: 'Blade Knight', 18: 'Blade Master',
  32: 'Fairy Elf', 33: 'Muse Elf', 34: 'High Elf',
  48: 'Magic Gladiator', 49: 'Magic Gladiator', 50: 'Duel Master',
  64: 'Dark Lord', 65: 'Lord Emperor', 66: 'Lord Emperor',
  80: 'Summoner', 81: 'Bloody Summoner', 82: 'Dimension Master',
  96: 'Rage Fighter', 97: 'Fist Master', 98: 'Fist Master',
  112: 'Grow Lancer', 114: 'Mirage Lancer',
  128: 'Rune Wizard', 129: 'Rune Spell Master', 130: 'Grand Rune Master',
  144: 'Slayer', 145: 'Royal Slayer', 146: 'Master Slayer',
  160: 'Gun Crusher', 161: 'Gun Breaker', 162: 'Master Gun Breaker',
};
const className = (id) => CLASS_NAMES[id] || `Clase ${id}`;
const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const lower = (s) => String(s || '').toLowerCase();

// ---------- HTTP ----------
// El origen falla de forma intermitente (respuestas vacías o cortes): se reintenta con una pequeña espera.
async function fetchJson(path, { retries = 2, timeoutMs = 20000 } = {}) {
  let lastErr;
  for (let i = 0; i <= retries; i++) {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), timeoutMs);
    try {
      const res = await fetch(`${base()}${path}`, {
        signal: ctl.signal,
        headers: { 'User-Agent': 'ParagonWeb/1.0', Accept: 'application/json' },
      });
      if (!res.ok) {
        const err = new Error(`El origen respondió ${res.status}`);
        err.status = res.status;
        if (res.status >= 400 && res.status < 500 && res.status !== 429) err.permanent = true; // no tiene sentido reintentar
        throw err;
      }
      const data = await res.json();
      if (data && data.success === false) throw Object.assign(new Error(data.error || 'Respuesta inválida'), { permanent: true });
      return data;
    } catch (e) {
      lastErr = e;
      if (e.permanent) break;
      if (i < retries) await sleep(400 * (i + 1));
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastErr;
}

// ---------- Caché con refresco en segundo plano ----------
// Dentro del TTL devuelve el dato guardado. Vencido, devuelve el anterior al instante y refresca por detrás;
// sin dato previo espera a la carga. Tras un fallo no vuelve a intentar durante FAIL_BACKOFF.
const FAIL_BACKOFF = 30_000;
const store = new Map();

function cached(key, ttlMs, loader) {
  let e = store.get(key);
  if (!e) { e = {}; store.set(key, e); }
  const now = Date.now();
  if (e.has && now - e.at < ttlMs) return Promise.resolve(e.value);

  const backingOff = e.failedAt && now - e.failedAt < FAIL_BACKOFF;
  if (!e.promise && !backingOff) {
    e.promise = loader()
      .then((value) => { Object.assign(e, { value, has: true, at: Date.now(), failedAt: 0, error: null }); return value; },
        (error) => { Object.assign(e, { failedAt: Date.now(), error }); throw error; })
      .finally(() => { e.promise = null; });
    e.promise.catch(() => {}); // si nadie lo espera (refresco por detrás), el fallo ya quedó registrado en `e`
  }
  if (e.has) return Promise.resolve(e.value);
  return e.promise || Promise.reject(e.error);
}

// Evita que la caché de perfiles crezca sin límite.
function prune() {
  if (store.size < 3000) return;
  const cutoff = Date.now() - 60 * 60_000;
  for (const [k, e] of store) if (!e.promise && (!e.has || e.at < cutoff)) store.delete(k);
}

// Cola con tope de peticiones simultáneas al origen.
function createPool(max) {
  let active = 0;
  const queue = [];
  const next = () => {
    if (active >= max || !queue.length) return;
    active++;
    const { fn, resolve, reject } = queue.shift();
    fn().then(resolve, reject).finally(() => { active--; next(); });
  };
  return (fn) => new Promise((resolve, reject) => { queue.push({ fn, resolve, reject }); next(); });
}
const profilePool = createPool(6);

// ---------- Datos ----------
// Top 100 por nivel: único listado que trae nivel, master level, resets y GS juntos.
function levelRanking(realm) {
  return cached(`level:${realm}`, 5 * 60_000, async () => {
    const data = await fetchJson(`/api/ranking/level?realm=${REALMS[realm]}`);
    return (data.ranking || []).map((r) => ({
      rank: r.Rank,
      name: r.Name,
      classId: r.Class,
      className: className(r.Class),
      level: num(r.Level ?? r.EffectiveLevel),
      masterLevel: num(r.MasterLevel),
      resets: num(r.Resets),
      gearScore: num(r.GearScore),
      guild: r.GuildName || '',
      guildMark: r.GuildMark || '',
    }));
  });
}

// Todos los personajes del servidor (nick, clase, GS y clan), ordenados por GS. De aquí salen los integrantes de cada clan.
function characterIndex(realm) {
  return cached(`index:${realm}`, 10 * 60_000, async () => {
    const byName = new Map(); // el orden puede moverse entre páginas si cambia un GS: se deduplica por nick
    let page = 1;
    let totalPages = 1;
    do {
      const data = await fetchJson(`/api/ranking/gearscore?realm=${REALMS[realm]}&page=${page}&pageSize=${INDEX_PAGE}`);
      totalPages = data.pagination?.totalPages || 1;
      for (const r of data.ranking || []) {
        byName.set(lower(r.Name), {
          name: r.Name,
          classId: r.Class,
          className: className(r.Class),
          gearScore: num(r.GearScore),
          guild: /^sin guil/i.test(r.Guild || '') ? '' : (r.Guild || ''),
        });
      }
      page++;
    } while (page <= totalPages);
    if (!byName.size) throw new Error('El listado de personajes llegó vacío');
    return [...byName.values()];
  });
}

// Ítem equipado, reducido a lo que se muestra. Las imágenes se piden a nuestro propio servidor (ver itemImage).
function normalizeItem(e) {
  const base = { slot: e.slotIndex, empty: !!e.isEmpty };
  if (e.isEmpty) return base;
  const file = /\/(\d{1,3}-\d{1,4})\.gif$/.exec(e.imagePath || '');
  return {
    ...base,
    name: e.name,
    level: num(e.level),
    rarity: e.rarity || 'common',
    image: file ? `/api/ranking/item/${file[1]}.gif` : null,
    skill: !!e.skill,
    luck: !!e.luck,
    option: num(e.life) * 4, // opción adicional: +4 por nivel
    excellent: Array.isArray(e.excellentOptions) ? e.excellentOptions : [],
    ancient: num(e.ancient),
    harmony: e.harmonyOption?.label || '',
    sockets: num(e.socketCount),
    refinery: !!e.refinery,
    temporal: !!e.isTemporal,
  };
}

// Perfil de un personaje: datos básicos y equipamiento. null si no existe; { hidden: true } si el jugador ocultó su perfil.
// También sirve para completar nivel y resets de los integrantes de un clan que no están en el top 100.
function profile(realm, name) {
  prune();
  return cached(`profile:${realm}:${lower(name)}`, 10 * 60_000, () => profilePool(async () => {
    try {
      const data = await fetchJson(`/api/profile/${encodeURIComponent(name)}?realm=${REALMS[realm]}`, { retries: 1 });
      const c = data.character;
      if (!c) return data.hidden ? { name, hidden: true } : null;
      return {
        name: c.name,
        classId: c.class,
        className: c.className || className(c.class),
        level: num(c.level),
        resets: num(c.resets),
        gearScore: num(c.gearScore),
        guild: c.guild ? { name: c.guild.name, mark: c.guild.mark || '', isMaster: !!c.guild.isMaster } : null,
        hidden: !!data.hidden,
        equipmentEnabled: data.equipmentEnabled !== false,
        equipment: data.hidden ? [] : (data.equipment || []).map(normalizeItem),
      };
    } catch (e) {
      if (e.permanent) return null;
      throw e;
    }
  }));
}

// Imagen de un ítem (p. ej. "4-22.gif"), guardada en memoria para no depender del origen en cada visita.
function itemImage(file) {
  if (!/^\d{1,3}-\d{1,4}\.gif$/.test(file)) return Promise.resolve(null);
  return cached(`item:${file}`, 24 * 60 * 60_000, async () => {
    const res = await fetch(`${base()}/en/items/${file}`, { headers: { 'User-Agent': 'ParagonWeb/1.0' }, signal: AbortSignal.timeout(15000) });
    if (!res.ok) throw new Error(`El origen respondió ${res.status}`);
    return Buffer.from(await res.arrayBuffer());
  });
}

// Lista de clanes con su número de integrantes y GS acumulado.
function guilds(realm) {
  return cached(`guilds:${realm}`, 10 * 60_000, async () => {
    const [data, index] = await Promise.all([fetchJson(`/api/ranking/guilds?realm=${REALMS[realm]}`), characterIndex(realm)]);
    const stats = new Map();
    for (const c of index) {
      if (!c.guild) continue;
      const s = stats.get(lower(c.guild)) || { members: 0, total: 0 };
      s.members++;
      s.total += c.gearScore;
      stats.set(lower(c.guild), s);
    }
    return (data.ranking || []).map((g) => {
      const s = stats.get(lower(g.G_Name)) || { members: 0, total: 0 };
      return {
        name: g.G_Name,
        master: g.G_Master,
        score: num(g.G_Score),
        members: s.members,
        totalGearScore: s.total,
        avgGearScore: s.members ? Math.round(s.total / s.members) : 0,
      };
    });
  });
}

// Un clan con todos sus integrantes. null si el clan no existe.
async function guildDetail(realm, name) {
  const g = (await guilds(realm)).find((x) => lower(x.name) === lower(name));
  if (!g) return null;
  const [index, top] = await Promise.all([characterIndex(realm), levelRanking(realm).catch(() => [])]);
  const topByName = new Map(top.map((r) => [lower(r.name), r]));

  let mark = top.find((r) => lower(r.guild) === lower(g.name) && r.guildMark)?.guildMark || '';
  const roster = index.filter((c) => lower(c.guild) === lower(g.name)).slice(0, MAX_MEMBERS);

  const members = await Promise.all(roster.map(async (c) => {
    const t = topByName.get(lower(c.name));
    // masterLevel solo existe en el top 100; para el resto el origen no lo publica (null = sin dato).
    let level = null; let masterLevel = null; let resets = null;
    if (t) {
      ({ level, masterLevel, resets } = t);
    } else {
      const p = await profile(realm, c.name).catch(() => null);
      if (p && !p.hidden) { level = p.level; resets = p.resets; if (!mark) mark = p.guild?.mark || ''; }
    }
    return {
      name: c.name,
      classId: c.classId,
      className: c.className,
      level,
      masterLevel,
      resets,
      gearScore: c.gearScore,
      guild: g.name,
      isMaster: lower(c.name) === lower(g.master),
    };
  }));

  // Manda resets, luego nivel y GS; quien no tiene dato de nivel/resets (-1) queda al final.
  members.sort((a, b) => (b.resets ?? -1) - (a.resets ?? -1) || (b.level ?? -1) - (a.level ?? -1) || b.gearScore - a.gearScore || a.name.localeCompare(b.name));
  return { guild: { ...g, mark }, members };
}

// Calienta la caché del clan propio para que su página cargue al instante.
function warmOwnGuild(realm = 'smash') {
  return guildDetail(realm, ownGuild()).catch((e) => console.warn(`[ranking] No se pudo precargar el clan: ${e.message}`));
}

module.exports = { REALMS, ownGuild, levelRanking, characterIndex, guilds, guildDetail, profile, itemImage, warmOwnGuild };
