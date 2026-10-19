import React, { useEffect, useState } from 'react';
import { api } from '../api';

const PRESETS = [
  { label: 'Gmail', host: 'smtp.gmail.com', port: 587, secure: false },
  { label: 'Outlook / Microsoft 365', host: 'smtp.office365.com', port: 587, secure: false },
  { label: 'SSL (puerto 465)', port: 465, secure: true },
];

// Configuración del correo (SMTP) desde la web. Solo el admin entra aquí.
function MailSettings() {
  const [cfg, setCfg] = useState(null);
  const [form, setForm] = useState(null);
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);
  const [testTo, setTestTo] = useState('');
  const [test, setTest] = useState(null);
  const [testing, setTesting] = useState(false);

  const apply = (c) => {
    setCfg(c);
    setForm({ host: c.host, port: c.port, secure: c.secure, user: c.user, pass: '', clearPass: false, from: c.from, appUrl: c.appUrl });
  };

  useEffect(() => { api.get('/settings/mail').then(apply).catch((e) => setMsg({ ok: false, text: e.message })); }, []);

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
