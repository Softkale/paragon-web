// Limitador de intentos fallidos en memoria (suficiente para un solo proceso en un VPS pequeño).
// Cuenta fallos por clave dentro de una ventana; un éxito borra el contador.
function createLimiter({ max, windowMs }) {
  const hits = new Map();

  const recent = (key) => {
    const now = Date.now();
    const list = (hits.get(key) || []).filter((t) => now - t < windowMs);
    if (list.length) hits.set(key, list); else hits.delete(key);
    return list;
  };

  return {
    isBlocked: (key) => recent(key).length >= max,
    fail(key) {
      const list = recent(key);
      list.push(Date.now());
      hits.set(key, list);
      if (hits.size > 5000) for (const k of hits.keys()) { recent(k); if (hits.size <= 2500) break; } // poda
    },
    clear: (key) => hits.delete(key),
  };
}

module.exports = { createLimiter };
