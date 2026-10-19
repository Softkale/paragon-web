import React, { useCallback, useEffect, useState } from 'react';
import { api } from '../api';

const STATE_TEXT = { upcoming: 'Próxima', open: 'Abierta', closed: 'Cerrada' };

// Configuración de la marcación: duración de la ventana, zona horaria y apertura/cierre manual de hoy.
export default function CheckinControl() {
  const [status, setStatus] = useState(null);
  const [form, setForm] = useState({ checkin_minutes: '', timezone: '' });
  const [msg, setMsg] = useState(null);

  const load = useCallback(async () => {
    const [s, cfg] = await Promise.all([api.get('/invasions/status'), api.get('/invasions/settings')]);
    setStatus(s);
    setForm((f) => (f.timezone ? f : { checkin_minutes: String(cfg.checkin_minutes), timezone: cfg.timezone }));
  }, []);

  useEffect(() => {
    load().catch((e) => setMsg({ ok: false, text: e.message }));
    const t = setInterval(() => load().catch(() => {}), 20000);
    return () => clearInterval(t);
  }, [load]);

  const save = async (e) => {
    e.preventDefault();
    try {
      await api.put('/invasions/settings', { checkin_minutes: Number(form.checkin_minutes), timezone: form.timezone });
      setMsg({ ok: true, text: 'Configuración guardada.' });
      await load();
    } catch (err) {
      setMsg({ ok: false, text: err.message });
    }
  };

  const setOverride = async (slot, state) => {
    try {
      await api.put('/invasions/override', { slot, state });
      await load();
    } catch (err) {
      setMsg({ ok: false, text: err.message });
    }
  };

  if (!status) return null;

  return (
    <div className="card" style={{ marginBottom: 28 }}>
      <h3 className="admin-h">Marcación de asistencia por los miembros</h3>
      <form className="form-grid" onSubmit={save}>
        <label className="field">
          <span>Minutos para marcar desde el inicio</span>
          <input type="number" min="1" max="120" value={form.checkin_minutes} onChange={(e) => setForm({ ...form, checkin_minutes: e.target.value })} required />
        </label>
        <label className="field">
          <span>Zona horaria de las invasiones (Perú: America/Lima)</span>
          <input value={form.timezone} onChange={(e) => setForm({ ...form, timezone: e.target.value })} required />
        </label>
        <div className="form-actions"><button className="btn btn--sm" type="submit">Guardar</button></div>
      </form>
      {msg && <p className={`form-msg ${msg.ok ? 'form-msg--ok' : 'form-msg--error'}`} style={{ marginTop: 12 }}>{msg.text}</p>}

      <h4 className="control-sub">Hoy · control manual</h4>
      <div className="control-slots">
        {status.slots.map((s) => (
          <div key={s.slot} className="control-slot">
            <div>
              <b>{s.slot}</b>
              <span className={`status status--${s.state === 'open' ? 'activo' : s.state === 'closed' ? 'inactivo' : 'pendiente'}`}>
                {STATE_TEXT[s.state]}{s.override ? ' (manual)' : ''}
              </span>
            </div>
            <div className="form-actions">
              <button className="icon-btn" onClick={() => setOverride(s.slot, 'open')}>Abrir</button>
              <button className="icon-btn" onClick={() => setOverride(s.slot, 'closed')}>Cerrar</button>
              {s.override && <button className="icon-btn" onClick={() => setOverride(s.slot, null)}>Horario normal</button>}
            </div>
          </div>
        ))}
      </div>
      <p className="muted" style={{ marginTop: 10 }}>
        «Abrir» deja marcar sin límite de tiempo hasta que lo cierres; «Cerrar» bloquea la marcación aunque esté en horario. Solo afecta a hoy.
      </p>
    </div>
  );
}
