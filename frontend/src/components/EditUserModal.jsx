import React, { useEffect, useState } from 'react';
import { api } from '../api';
import TempPassword from './TempPassword';

const fmt = (d) => new Date(d).toLocaleDateString('es');

// Ventana para editar los datos de un usuario y resetear su clave (le llegan accesos nuevos por correo).
export default function EditUserModal({ user, me, onClose, onSaved }) {
  const [form, setForm] = useState({ character_name: user.character_name, email: user.email, character_class: user.character_class || '' });
  const [msg, setMsg] = useState(null);
  const [resetMsg, setResetMsg] = useState(null);
  const [busy, setBusy] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [send, setSend] = useState(true);
  const [configured, setConfigured] = useState(true);
  const [temp, setTemp] = useState(null);

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  const dirty = form.character_name !== user.character_name || form.email !== user.email || form.character_class !== (user.character_class || '');
  const isSelf = user.id === me.id;

  useEffect(() => {
    api.get('/users/mail-status').then((r) => { setConfigured(r.configured); setSend(r.configured); }).catch(() => {});
  }, []);

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const save = async (e) => {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    try {
      await api.patch(`/users/${user.id}`, form);
      await onSaved();
      setMsg({ ok: true, text: 'Datos guardados.' });
    } catch (err) {
      setMsg({ ok: false, text: err.message });
    } finally {
      setBusy(false);
    }
  };

  const reset = async () => {
    const how = send ? 'se enviará por correo' : 'se te mostrará aquí para que se la pases';
    const text = isSelf
      ? `Se generará una contraseña temporal para TI y ${how}. Tu clave actual dejará de funcionar. ¿Continuar?`
      : `Se generará una contraseña temporal para ${user.character_name} y ${how}. Su clave actual dejará de funcionar y deberá cambiarla al ingresar. ¿Continuar?`;
    if (!window.confirm(text)) return;
    setResetting(true);
    setResetMsg(null);
    setTemp(null);
    try {
      const res = await api.post(`/users/${user.id}/reset-password`, { sendEmail: send });
      const { email } = res;
      await onSaved();
      if (res.temporaryPassword) { setTemp(res.temporaryPassword); setResetMsg({ ok: true, text: 'Clave reseteada. No se envió correo.' }); }
      else if (email.sent) setResetMsg({ ok: true, text: `Accesos nuevos enviados a ${user.email}.` });
      else if (!email.smtpConfigured) setResetMsg({ ok: false, text: 'El correo (SMTP) no está configurado: se guardó en backend/outbox y no se envió.' });
      else setResetMsg({ ok: false, text: `La clave se reseteó pero el correo no se pudo enviar: ${email.error}` });
    } catch (err) {
      setResetMsg({ ok: false, text: err.message });
    } finally {
      setResetting(false);
    }
  };

  return (
    <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal card" role="dialog" aria-modal="true" aria-label={`Editar ${user.character_name}`}>
        <div className="toolbar" style={{ marginBottom: 14 }}>
          <h3 className="admin-h" style={{ margin: 0 }}>Editar usuario</h3>
          <button className="icon-btn" onClick={onClose} aria-label="Cerrar">✕</button>
        </div>

        <form className="modal__form" onSubmit={save}>
          <label className="field">
            <span>Usuario (con el que inicia sesión)</span>
            <input value={form.character_name} maxLength={40} onChange={set('character_name')} required />
          </label>
          <label className="field">
            <span>Correo</span>
            <input type="email" value={form.email} maxLength={120} onChange={set('email')} required />
          </label>
          <label className="field">
            <span>Clase</span>
            <input value={form.character_class} maxLength={40} onChange={set('character_class')} />
          </label>
          {form.character_name !== user.character_name && (
            <p className="muted">Si cambias el usuario, deberá iniciar sesión con el nombre nuevo.</p>
          )}
          {msg && <p className={`form-msg ${msg.ok ? 'form-msg--ok' : 'form-msg--error'}`}>{msg.text}</p>}
          <div className="form-actions">
            <button className="btn btn--sm" type="submit" disabled={busy || !dirty}>{busy ? 'Guardando…' : 'Guardar cambios'}</button>
            <button type="button" className="icon-btn" onClick={onClose}>Cerrar</button>
          </div>
        </form>

        <div className="modal__reset">
          <h4 className="control-sub" style={{ marginTop: 0 }}>Contraseña y accesos</h4>
          <p className="muted">
            {user.must_change_password
              ? <>Invitación pendiente{user.invited_at ? ` (enviada el ${fmt(user.invited_at)})` : ''}: todavía no cambió su contraseña temporal.</>
              : <>Registrado{user.registered_at ? ` el ${fmt(user.registered_at)}` : ''}. </>}
            {' '}Resetear genera una contraseña temporal nueva y reenvía los accesos a <b>{user.email}</b>.
          </p>
          {dirty && <p className="muted">Guarda primero los cambios de correo para que los accesos lleguen a la dirección nueva.</p>}
          <button className="btn btn--sm btn--ghost" style={{ marginTop: 10 }} onClick={reset} disabled={resetting || dirty}>
            {resetting ? 'Procesando…' : send ? '✉ Resetear clave y reenviar accesos' : '🔑 Resetear clave y ver la nueva'}
          </button>
          <label className="check-row">
            <input type="checkbox" checked={send} onChange={(e) => setSend(e.target.checked)} />
            Enviar los accesos por correo{!configured && <small className="muted"> · correo sin configurar</small>}
          </label>
          {temp && <TempPassword name={user.character_name} password={temp} />}
          {resetMsg && <p className={`form-msg ${resetMsg.ok ? 'form-msg--ok' : 'form-msg--error'}`} style={{ marginTop: 12 }}>{resetMsg.text}</p>}
        </div>
      </div>
    </div>
  );
}
