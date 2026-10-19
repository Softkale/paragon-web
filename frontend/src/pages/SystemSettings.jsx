import React, { useEffect, useState } from 'react';
import { api } from '../api';

const PRESETS = [
  { label: 'Gmail', host: 'smtp.gmail.com', port: 587, secure: false },
  { label: 'Outlook / Microsoft 365', host: 'smtp.office365.com', port: 587, secure: false },
  { label: 'SSL (puerto 465)', port: 465, secure: true },
];

const KIND = { prueba: 'Prueba', accesos: 'Accesos', reseteo: 'Reseteo de clave', recuperacion: 'Recuperación', otro: 'Otro' };
const STATUS = {
  enviado: { label: 'Enviado', cls: 'activo' },
  fallo: { label: 'Falló', cls: 'rechazado' },
  sin_smtp: { label: 'No enviado', cls: 'pendiente' },
};

// Configuración del correo (SMTP) desde la web. Solo el admin entra aquí.
function MailSettings() {
  const [cfg, setCfg] = useState(null);
  const [form, setForm] = useState(null);
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);
  const [testTo, setTestTo] = useState('');
  const [test, setTest] = useState(null);
  const [testing, setTesting] = useState(false);
  const [log, setLog] = useState(null);

  const loadLog = () => api.get('/settings/mail/log').then(setLog).catch(() => {});

  const apply = (c) => {
    setCfg(c);
    setForm({ host: c.host, port: c.port, secure: c.secure, user: c.user, pass: '', clearPass: false, from: c.from, appUrl: c.appUrl });
  };

  useEffect(() => { api.get('/settings/mail').then(apply).catch((e) => setMsg({ ok: false, text: e.message })); loadLog(); }, []);

  if (!form) return <div className="card empty">{msg ? msg.text : 'Cargando…'}</div>;

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });

  const save = async (e) => {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    setTest(null);
    try {
      apply(await api.put('/settings/mail', { ...form, port: Number(form.port) }));
      setMsg({ ok: true, text: 'Configuración guardada. Envía un correo de prueba para comprobarla.' });
    } catch (err) {
      setMsg({ ok: false, text: err.message });
    } finally {
      setBusy(false);
    }
  };

  const sendTest = async () => {
    setTesting(true);
    setTest(null);
    try {
      setTest(await api.post('/settings/mail/test', { to: testTo }));
    } catch (err) {
      setTest({ sent: false, error: err.message });
    } finally {
      setTesting(false);
      loadLog();
    }
  };

  const dirty = JSON.stringify([form.host, Number(form.port), form.secure, form.user, form.from, form.appUrl]) !== JSON.stringify([cfg.host, cfg.port, cfg.secure, cfg.user, cfg.from, cfg.appUrl]) || !!form.pass || form.clearPass;

  return (
    <div className="card settings-card">
      <h3 className="admin-h">Correo (SMTP)</h3>
      <div className={`settings-status ${cfg.configured ? 'is-on' : ''}`}>
        {cfg.configured
          ? <>✓ Configurado: <b>{cfg.host}:{cfg.port}</b>{cfg.source === 'env' ? ' (desde el archivo .env; al guardar aquí, el panel tendrá prioridad)' : ''}</>
          : <>Sin configurar: los correos de accesos <b>no se envían</b>; se guardan como archivos en <code>backend/outbox</code>.</>}
      </div>
      {cfg.passError && <p className="form-msg form-msg--error" style={{ margin: '12px 0' }}>{cfg.passError}</p>}

      <div className="form-actions" style={{ margin: '16px 0 6px' }}>
        <span className="muted">Rellenar rápido:</span>
        {PRESETS.map((p) => (
          <button key={p.label} type="button" className="icon-btn" onClick={() => setForm({ ...form, host: p.host ?? form.host, port: p.port, secure: p.secure })}>{p.label}</button>
        ))}
      </div>

      <form className="form-grid" onSubmit={save}>
        <label className="field"><span>Servidor SMTP</span><input value={form.host} onChange={set('host')} placeholder="smtp.gmail.com" /></label>
        <label className="field"><span>Puerto</span><input type="number" value={form.port} onChange={set('port')} placeholder="587" /></label>
        <label className="field check-field">
          <span>Conexión segura (SSL/TLS)</span>
          <label className="check-row"><input type="checkbox" checked={form.secure} onChange={set('secure')} /> Activar (puerto 465). Con 587 déjalo apagado.</label>
        </label>
        <label className="field"><span>Usuario</span><input value={form.user} onChange={set('user')} placeholder="tucorreo@gmail.com" autoComplete="off" /></label>
        <label className="field">
          <span>Contraseña</span>
          <input type="password" value={form.pass} onChange={set('pass')} placeholder={cfg.passSet ? '•••••••• (guardada)' : 'Clave de aplicación'} autoComplete="new-password" disabled={form.clearPass} />
        </label>
        {cfg.passSet && (
          <label className="field check-field">
            <span>&nbsp;</span>
            <label className="check-row"><input type="checkbox" checked={form.clearPass} onChange={set('clearPass')} /> Quitar la contraseña guardada</label>
          </label>
        )}
        <label className="field field--wide"><span>Remitente (como lo verán los usuarios)</span><input value={form.from} onChange={set('from')} placeholder="PARAGON <no-reply@tudominio.com>" /></label>
        <label className="field field--wide"><span>Dirección pública de la web (va en el botón «Ingresar» del correo)</span><input value={form.appUrl} onChange={set('appUrl')} placeholder="https://paragon.tudominio.com" required /></label>
        <div className="form-actions field--wide">
          <button className="btn btn--sm" type="submit" disabled={busy || !dirty}>{busy ? 'Guardando…' : 'Guardar configuración'}</button>
          <span className="muted">Dejar el servidor vacío desactiva el envío.</span>
        </div>
      </form>
      {msg && <p className={`form-msg ${msg.ok ? 'form-msg--ok' : 'form-msg--error'}`} style={{ marginTop: 12 }}>{msg.text}</p>}

      <h4 className="control-sub">Probar el envío</h4>
      <div className="tz-row">
        <input className="search" style={{ flex: 1 }} type="email" placeholder="correo donde recibirás la prueba" value={testTo} onChange={(e) => setTestTo(e.target.value)} />
        <button className="btn btn--sm" onClick={sendTest} disabled={testing || !testTo || dirty}>{testing ? 'Enviando…' : 'Enviar correo de prueba'}</button>
      </div>
      {dirty && <p className="muted" style={{ marginTop: 8 }}>Guarda la configuración antes de probar.</p>}
      {test && (
        test.sent
          ? <p className="form-msg form-msg--ok" style={{ marginTop: 12 }}>✓ Correo enviado a {testTo}. Revisa la bandeja (y spam).</p>
          : <p className="form-msg form-msg--error" style={{ marginTop: 12 }}>
              {test.smtpConfigured === false ? 'No hay servidor SMTP configurado: el mensaje se guardó en backend/outbox y no se envió.' : `No se pudo enviar: ${test.error}`}
            </p>
      )}

      <div className="toolbar" style={{ marginTop: 28 }}>
        <h4 className="control-sub" style={{ margin: 0 }}>Registro de envíos</h4>
        <button className="icon-btn" onClick={loadLog}>↻ Actualizar</button>
      </div>
      {log && (
        <>
          <div className="mail-summary">
            <span className="status status--activo">{log.last24h.enviado} enviados</span>
            <span className="status status--rechazado">{log.last24h.fallo} con fallo</span>
            <span className="status status--pendiente">{log.last24h.sin_smtp} sin enviar (SMTP sin configurar)</span>
            <small className="muted">últimas 24 horas</small>
          </div>
          {!log.rows.length ? (
            <p className="muted" style={{ marginTop: 10 }}>Aún no hay envíos registrados. Envía un correo de prueba para ver el primero.</p>
          ) : (
            <div className="table-wrap mail-log">
              <table className="table">
                <thead><tr><th>Fecha</th><th>Destinatario</th><th>Tipo</th><th>Estado</th><th>Detalle</th></tr></thead>
                <tbody>
                  {log.rows.map((r) => (
                    <tr key={r.id}>
                      <td>{new Date(r.created_at).toLocaleString('es', { hour12: false })}</td>
                      <td>{r.to_email}</td>
                      <td><span className="tag">{KIND[r.kind] || r.kind}</span></td>
                      <td><span className={`status status--${STATUS[r.status].cls}`}>{STATUS[r.status].label}</span></td>
                      <td className="mail-log__detail">{r.detail || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="muted settings-note" style={{ marginTop: 10 }}>
            «Enviado» significa que el servidor de correo <b>aceptó</b> el mensaje; no garantiza que llegue a la bandeja principal.
            Si alguien dice que no le llegó: revisa su carpeta de spam y que el correo esté bien escrito (Miembros → Editar).
          </p>
        </>
      )}

      <p className="muted settings-note">
        La contraseña se guarda cifrada en la base de datos y nunca se vuelve a mostrar. Si cambias el <code>JWT_SECRET</code> del servidor, tendrás que escribirla de nuevo.
        En Gmail necesitas una «contraseña de aplicación» (requiere verificación en dos pasos).
      </p>
    </div>
  );
}

export default function SystemSettings() {
  return <MailSettings />;
}
