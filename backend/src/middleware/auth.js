const jwt = require('jsonwebtoken');
const db = require('../db');

// Jerarquía: un rol puede hacer todo lo que hace uno menor.
const LEVEL = { miembro: 1, oficial: 2, admin: 3 };

// Valida el token y toma el rol y el estado ACTUALES desde la base de datos, no del token.
// Así un cambio de rol o una desactivación surten efecto de inmediato, sin esperar a que expire la sesión.
async function authenticate(req, res) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) {
    res.status(401).json({ error: 'No autenticado' });
    return false;
  }
  let payload;
  try {
    payload = jwt.verify(token, process.env.JWT_SECRET);
  } catch {
    res.status(401).json({ error: 'Sesión inválida o expirada' });
    return false;
  }

  const { rows } = await db.query('SELECT role, status, must_change_password, records_attendance FROM users WHERE id = $1', [payload.id]);
  const user = rows[0];
  if (!user || user.status !== 'activo') {
    res.status(401).json({ error: 'Tu cuenta no está activa' });
    return false;
  }
  req.user = { ...payload, role: user.role, mcp: user.must_change_password, recorder: user.role === 'admin' || (user.role === 'oficial' && user.records_attendance) };
  return true;
}

// Exige sesión válida y que no tenga pendiente el cambio de contraseña temporal.
async function requireAuth(req, res, next) {
  if (!(await authenticate(req, res))) return;
  if (req.user.mcp) {
    return res.status(403).json({ error: 'Debes cambiar tu contraseña temporal primero', code: 'PASSWORD_CHANGE_REQUIRED' });
  }
  next();
}

// Solo sesión válida: para /me y el cambio de contraseña.
async function requireSession(req, res, next) {
  if (await authenticate(req, res)) next();
}

// requireRole('oficial') permite oficial y admin.
function requireRole(minRole) {
  return (req, res, next) => {
    if ((LEVEL[req.user.role] || 0) < LEVEL[minRole]) {
      return res.status(403).json({ error: 'No tienes permisos para esta acción' });
    }
    next();
  };
}

// Solo el admin y el oficial designado anotan la asistencia a las invasiones.
function requireRecorder(req, res, next) {
  if (!req.user.recorder) {
    return res.status(403).json({ error: 'Solo el oficial designado para la asistencia puede registrarla' });
  }
  next();
}

module.exports = { requireAuth, requireSession, requireRole, requireRecorder, LEVEL };
