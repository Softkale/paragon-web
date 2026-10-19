import React, { useEffect, useState } from 'react';
import { Link, Redirect, useHistory } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../AuthContext';
import Invasions from './Invasions';
import Reports from './Reports';
import BulkImport from '../components/BulkImport';
import EditUserModal from '../components/EditUserModal';
import TempPassword from '../components/TempPassword';
import useList from '../components/useList';
import ContentAdmin from './ContentAdmin';
import SystemSettings from './SystemSettings';

const ROLE_LABEL = { admin: 'Administrador', oficial: 'Oficial', miembro: 'Miembro' };

const sections = [
  { id: 'dashboard', label: 'Resumen', icon: '📊' },
  { id: 'invasions', label: 'Invasiones', icon: '⚔️' },
  { id: 'reports', label: 'Reportes', icon: '📈' },
  { id: 'members', label: 'Miembros', icon: '👥' },
  { id: 'content', label: 'Contenido', icon: '🖋️' },
  { id: 'settings', label: 'Configuración', icon: '⚙️', adminOnly: true },
];

const fmtDate = (d) => new Date(d).toLocaleDateString('es');

// Acceso: "Invitación pendiente" hasta que el usuario cambia su clave temporal; luego "Registrado".
function AccessBadge({ user }) {
  if (user.must_change_password) {
    return (
      <span className="status status--pendiente" title="Aún no cambia su contraseña temporal">
        Invitación pendiente{user.invited_at ? <small className="access-date"> · {fmtDate(user.invited_at)}</small> : null}
      </span>
    );
  }
  return (
    <span className="status status--activo" title="Ya cambió su contraseña">
      Registrado{user.registered_at ? <small className="access-date"> · {fmtDate(user.registered_at)}</small> : null}
    </span>
  );
}

function StatusBadge({ status }) {
  return <span className={`status status--${status}`}>{status}</span>;
}

function Dashboard() {
  const [users] = useList('/users');
  const [events] = useList('/events');
  const [news] = useList('/news');
  const count = (s) => users.filter((u) => u.status === s).length;

  const kpis = [
    { label: 'Miembros activos', value: count('activo') },
    { label: 'Invitaciones pendientes', value: users.filter((u) => u.status === 'activo' && u.must_change_password).length },
    { label: 'Eventos', value: events.length },
    { label: 'Noticias', value: news.length },
  ];

  return (
    <>
      <div className="kpis">
        {kpis.map((k) => (
          <div key={k.label} className="card kpi">
            <span>{k.label}</span>
            <strong>{k.value}</strong>
          </div>
        ))}
      </div>
      <h3 className="admin-h">Últimos registros</h3>
      <div className="card table-wrap">
        <table className="table">
          <thead><tr><th>Jugador</th><th>Clase</th><th>Rol</th><th>Estado</th><th>Registro</th></tr></thead>
          <tbody>
            {users.slice(0, 5).map((u) => (
              <tr key={u.id}>
                <td><b>{u.character_name}</b></td>
                <td>{u.character_class || '—'}</td>
                <td><span className="tag">{u.role}</span></td>
                <td><StatusBadge status={u.status} /></td>
                <td>{fmtDate(u.created_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

const emailNotice = (mail) =>
  mail.sent
    ? 'Accesos enviados por correo.'
    : mail.smtpConfigured
      ? `No se pudo enviar el correo (${mail.error}). Usa "Reenviar accesos" cuando se corrija.`
      : 'SMTP no configurado: el correo se guardó en backend/outbox (no se envió).';

function NewMember({ me, onDone }) {
  const empty = { character_name: '', email: '', character_class: '', role: 'miembro' };
  const [form, setForm] = useState(empty);
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);
  const [send, setSend] = useState(true);
  const [configured, setConfigured] = useState(true);
  const [temp, setTemp] = useState(null);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  // Si el correo no está configurado, se propone mostrar la clave en pantalla en vez de enviarla.
  useEffect(() => {
    api.get('/users/mail-status').then((r) => { setConfigured(r.configured); setSend(r.configured); }).catch(() => {});
  }, []);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    try {
      setTemp(null);
      const res = await api.post('/users', { ...form, sendEmail: send });
      if (res.temporaryPassword) {
        setTemp({ name: res.user.character_name, password: res.temporaryPassword });
        setMsg({ ok: true, text: `${res.user.character_name} creado sin enviar correo.` });
      } else {
        setMsg({ ok: res.email.sent, text: `${res.user.character_name} creado. ${emailNotice(res.email)}` });
      }
      setForm(empty);
      onDone();
    } catch (err) {
      setMsg({ ok: false, text: err.message });
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="card form-grid" onSubmit={submit} style={{ marginBottom: 20 }}>
      <label className="field"><span>Usuario (personaje)</span><input value={form.character_name} onChange={set('character_name')} required /></label>
      <label className="field"><span>Correo</span><input type="email" value={form.email} onChange={set('email')} required /></label>
      <label className="field"><span>Clase</span><input value={form.character_class} onChange={set('character_class')} /></label>
      {me.role === 'admin' && (
        <label className="field">
          <span>Rol</span>
          <select className="select" value={form.role} onChange={set('role')}>
            <option value="miembro">miembro</option>
            <option value="oficial">oficial</option>
            <option value="admin">admin</option>
          </select>
        </label>
      )}
      <label className="check-row field--wide">
        <input type="checkbox" checked={send} onChange={(e) => setSend(e.target.checked)} />
        Enviar accesos por correo
        {!configured && <small className="muted"> · el correo aún no está configurado (Configuración → Correo)</small>}
      </label>
      <div className="form-actions">
        <button className="btn btn--sm" type="submit" disabled={busy}>{busy ? 'Creando…' : send ? 'Crear y enviar accesos' : 'Crear y ver la clave'}</button>
      </div>
      {msg && <p className={`form-msg field--wide ${msg.ok ? 'form-msg--ok' : 'form-msg--error'}`}>{msg.text}</p>}
      {temp && <TempPassword name={temp.name} password={temp.password} />}
    </form>
  );
}

function Members({ me }) {
  const [rows, reload, error] = useList('/users');
  const [q, setQ] = useState('');
  const [adding, setAdding] = useState(false);
  const [bulk, setBulk] = useState(false);
  const [editing, setEditing] = useState(null); // usuario que se está editando
  const [access, setAccess] = useState('all'); // all | invited | registered
  const isAdmin = me.role === 'admin';
  const members = rows.filter((u) => u.status !== 'pendiente');
  const invited = members.filter((u) => u.status === 'activo' && u.must_change_password && u.role !== 'admin' && (isAdmin || u.role === 'miembro')).length;
  const list = members.filter((u) => (
    u.character_name.toLowerCase().includes(q.toLowerCase())
    && (access === 'all' || (access === 'invited' ? u.must_change_password : !u.must_change_password))
  ));

  // Cambia el rol. Dar o quitar el rol de admin pide confirmación (control total del sistema).
  const changeRole = (u, role) => {
    const warn = role === 'admin'
      ? `¿Dar acceso de ADMINISTRADOR a ${u.character_name}? Tendrá control total del sistema.`
      : u.role === 'admin'
        ? `¿Quitarle el acceso de administrador a ${u.character_name}? Pasará a ser ${role}.`
        : null;
    if (warn && !window.confirm(warn)) { reload(); return; }
    run(() => api.patch(`/users/${u.id}/role`, { role }));
  };

  const resendAll = () => run(async () => {
    if (!window.confirm(`¿Generar una nueva contraseña temporal y reenviar la invitación a los ${invited} usuarios con invitación pendiente?`)) return;
    const r = await api.post('/users/resend-pending', {});
    window.alert(r.smtpConfigured
      ? `Invitaciones reenviadas: ${r.sent} de ${r.total}${r.notSent ? ` (${r.notSent} no se pudieron enviar)` : ''}.`
      : `SMTP no configurado: ${r.total} correos se guardaron en backend/outbox (no se enviaron).`);
  });

  const run = async (fn) => {
    try { await fn(); } catch (e) { window.alert(e.message); } finally { reload(); }
  };

  return (
    <>
      <div className="toolbar">
        <div className="form-actions">
          <input className="search" placeholder="Buscar miembro…" value={q} onChange={(e) => setQ(e.target.value)} />
          <select className="select" value={access} onChange={(e) => setAccess(e.target.value)}>
            <option value="all">Todos los accesos</option>
            <option value="invited">Invitación pendiente</option>
            <option value="registered">Registrados</option>
          </select>
        </div>
        <div className="form-actions">
          {invited > 0 && <button className="icon-btn" onClick={resendAll}>✉ Reenviar a pendientes ({invited})</button>}
          <button className="icon-btn" onClick={() => { setBulk(!bulk); setAdding(false); }}>⬆ Carga masiva</button>
          <button className="btn btn--sm" onClick={() => { setAdding(!adding); setBulk(false); }}>{adding ? 'Cerrar' : '+ Nuevo miembro'}</button>
        </div>
      </div>
      {bulk && <BulkImport onDone={reload} onClose={() => setBulk(false)} />}
      {adding && <NewMember me={me} onDone={reload} />}
      {editing && <EditUserModal user={editing} me={me} onClose={() => setEditing(null)} onSaved={async () => { await reload(); }} />}
      {error && <div className="card empty">{error}</div>}
      <div className="card table-wrap">
        <table className="table">
          <thead><tr><th>Jugador</th><th>Clase</th><th>Rol</th><th>Estado</th><th>Acceso</th><th>Alta</th><th /></tr></thead>
          <tbody>
            {list.map((u) => {
              const locked = u.role === 'admin' || (!isAdmin && u.role !== 'miembro');
              return (
                <tr key={u.id}>
                  <td><b>{u.character_name}</b></td>
                  <td>{u.character_class || '—'}</td>
                  <td>
                    {isAdmin && u.id !== me.id ? (
                      <select className="select" value={u.role} onChange={(e) => changeRole(u, e.target.value)}>
                        <option value="miembro">miembro</option>
                        <option value="oficial">oficial</option>
                        <option value="admin">admin</option>
                      </select>
                    ) : <span className="tag" title={u.id === me.id ? 'No puedes cambiar tu propio rol' : undefined}>{u.role}{u.id === me.id ? ' (tú)' : ''}</span>}
                  </td>
                  <td><StatusBadge status={u.status} /></td>
                  <td><AccessBadge user={u} /></td>
                  <td>{fmtDate(u.created_at)}</td>
                  <td className="actions">
                    {(isAdmin || u.role === 'miembro') && (
                      <button className="icon-btn" title="Editar datos y resetear clave" onClick={() => setEditing(u)}>✏️ Editar</button>
                    )}
                    {!locked && (
                      <button className="icon-btn" onClick={() => run(() => api.patch(`/users/${u.id}/status`, { status: u.status === 'activo' ? 'inactivo' : 'activo' }))}>
                        {u.status === 'activo' ? 'Desactivar' : 'Activar'}
                      </button>
                    )}
                    {isAdmin && u.role !== 'admin' && (
                      <button className="icon-btn" title="Eliminar" onClick={() => window.confirm(`¿Eliminar a ${u.character_name}?`) && run(() => api.del(`/users/${u.id}`))}>🗑️</button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}

export default function Admin() {
  const { user, loading, logout } = useAuth();
  const history = useHistory();
  const [active, setActive] = useState('dashboard');
  const [menu, setMenu] = useState(false);

  if (loading) return null;
  if (!user) return <Redirect to="/login" />;
  if (user.mustChange) return <Redirect to="/cambiar-clave" />;
  if (user.role === 'miembro') return <Redirect to="/" />;

  const menuItems = sections.filter((s) => !s.adminOnly || user.role === 'admin');
  const current = menuItems.find((s) => s.id === active) || menuItems[0];
  const views = {
    dashboard: <Dashboard />,
    invasions: <Invasions me={user} />,
    reports: <Reports />,
    members: <Members me={user} />,
    content: <ContentAdmin />,
    settings: <SystemSettings />,
  };

  return (
    <div className="admin">
      <aside className={`sidebar ${menu ? 'is-open' : ''}`}>
        <Link to="/" className="sidebar__brand">
          <img src="/img/paragon-logo.jpg" alt="" />
          <span>PARAGON</span>
        </Link>
        <nav>
          {menuItems.map((s) => (
            <button key={s.id} className={active === s.id ? 'is-active' : ''} onClick={() => { setActive(s.id); setMenu(false); }}>
              <span>{s.icon}</span>{s.label}
            </button>
          ))}
        </nav>
        <Link to="/invasiones" className="sidebar__logout">⏱️ Marcar mi asistencia</Link>
        <button className="sidebar__logout" onClick={() => { logout(); history.push('/login'); }}>Cerrar sesión</button>
      </aside>

      <section className="admin__main">
        <header className="admin__top">
          <button className="nav__burger" onClick={() => setMenu(!menu)} aria-label="Menú"><span /><span /><span /></button>
          <h1>{current.label}</h1>
          <div className="me">
            <span className="tag">{ROLE_LABEL[user.role]}</span>
            <i>{user.name.slice(0, 2).toUpperCase()}</i>
          </div>
        </header>
        <div className="admin__body">{views[current.id]}</div>
      </section>
    </div>
  );
}
