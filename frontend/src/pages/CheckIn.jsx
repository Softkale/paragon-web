import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Redirect } from 'react-router-dom';
import Embers from '../components/Embers';
import MemberBar from '../components/MemberBar';
import { api } from '../api';
import { useAuth } from '../AuthContext';

const DAY_NOTE = { '-1': 'ayer', 1: 'mañana' };
const zoneList = () =>
  typeof Intl.supportedValuesOf === 'function' ? Intl.supportedValuesOf('timeZone') : ['America/Lima', 'America/Bogota', 'America/Mexico_City', 'America/Santiago', 'America/Argentina/Buenos_Aires', 'Europe/Madrid'];
const pad = (n) => String(n).padStart(2, '0');
const clock = (sec) => {
  const s = Math.max(0, Math.floor(sec));
  const h = Math.floor(s / 3600);
  return `${h ? `${pad(h)}:` : ''}${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}`;
};
const fmtDay = (d) => new Date(`${d}T12:00:00`).toLocaleDateString('es', { weekday: 'long', day: 'numeric', month: 'long' });

export default function CheckIn() {
  const { user, loading } = useAuth();
  const [status, setStatus] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');
  const [toast, setToast] = useState('');
  const [, setTick] = useState(0);
  const [tz, setTz] = useState('');
  const [tzMsg, setTzMsg] = useState('');
  const fetchedAt = useRef(Date.now());

  const load = useCallback(async () => {
    try {
      const s = await api.get('/invasions/status');
      fetchedAt.current = Date.now();
      setStatus(s);
      setTz((cur) => cur || s.userTimezone || '');
      setError('');
    } catch (err) {
      setError(err.message);
    }
  }, []);

  // Refresca desde el servidor cada 15 s y redibuja cada segundo para las cuentas regresivas.
  useEffect(() => {
    if (!user || user.mustChange) return undefined;
    load();
    const poll = setInterval(load, 15000);
    const tick = setInterval(() => setTick((t) => t + 1), 1000);
    window.addEventListener('paragon:checkin', load);
    return () => { clearInterval(poll); clearInterval(tick); window.removeEventListener('paragon:checkin', load); };
  }, [user, load]);

  const elapsed = (Date.now() - fetchedAt.current) / 1000;

  // Cuando una cuenta regresiva llega a cero, pide el estado real al servidor.
  useEffect(() => {
    if (!status) return;
    const due = status.slots.some(
      (s) => (s.state === 'upcoming' && s.startsIn - elapsed <= 0) || (s.state === 'open' && s.remaining !== null && s.remaining - elapsed <= 0)
    );
    if (due) load();
  });

  if (loading) return null;
  if (!user) return <Redirect to="/login" />;
  if (user.mustChange) return <Redirect to="/cambiar-clave" />;

  const checkin = async (slot) => {
    setBusy(slot);
    setToast('');
    try {
      await api.post('/invasions/checkin', { slot });
      setToast('¡Asistencia registrada!');
      await load();
    } catch (err) {
      setError(err.message);
      await load();
    } finally {
      setBusy('');
    }
  };

  const saveZone = async (value) => {
    setTzMsg('');
    try {
      await api.put('/auth/timezone', { timezone: value });
      setTz(value);
      setTzMsg(value ? 'Zona horaria guardada.' : 'Ahora ves la hora de Perú.');
      await load();
    } catch (err) {
      setTzMsg(err.message);
    }
  };

  const abroad = status && status.userTimezone && status.userTimezone !== status.timezone;

  return (
    <main className="checkin">
      <Embers count={25} />
      <MemberBar />

      <section className="checkin__body">
        <h1>Asistencia a invasiones</h1>
        {status && <p className="checkin__date">{fmtDay(status.now.day)}</p>}
        {error && <p className="form-msg form-msg--error">{error}</p>}
        {toast && <p className="form-msg form-msg--ok">{toast}</p>}

        {status && !status.season && (
          <div className="card empty">Hoy no hay una temporada activa. Un oficial debe crearla para poder marcar asistencia.</div>
        )}

        {status && status.season && (
          <>
            <p className="checkin__season">
              {status.season.name} · llevas <b>{status.mine.count}</b> de {status.mine.opportunities} asistencias
              ({Math.round((status.mine.count / status.mine.opportunities) * 100)}%)
            </p>
            <div className="slot-grid">
              {status.slots.map((s) => {
                const left = s.remaining !== null ? s.remaining - elapsed : null;
                const startsIn = s.state === 'upcoming' ? s.startsIn - elapsed : null;
                const canMark = s.state === 'open' && !s.checked;
                return (
                  <article key={s.slot} className={`card slot slot--${s.checked ? 'done' : s.state}`}>
                    <span className="slot__time">{s.localTime}</span>
                    {abroad && (
                      <span className="slot__peru">
                        {s.slot} hora de Perú{DAY_NOTE[s.dayOffset] ? ` · ${DAY_NOTE[s.dayOffset]} para ti` : ''}
                      </span>
                    )}
                    {s.checked && <p className="slot__msg">✓ Asistencia registrada</p>}
                    {!s.checked && s.state === 'upcoming' && <p className="slot__msg">Comienza en <b>{clock(startsIn)}</b></p>}
                    {!s.checked && s.state === 'open' && (
                      <p className="slot__msg">{left !== null ? <>Cierra en <b>{clock(left)}</b></> : 'Abierta por un oficial'}</p>
                    )}
                    {!s.checked && s.state === 'closed' && <p className="slot__msg">Cerrada · sin registro</p>}
                    {canMark && (
                      <button className="btn btn--block" disabled={busy === s.slot} onClick={() => checkin(s.slot)}>
                        {busy === s.slot ? 'Marcando…' : 'Marcar asistencia'}
                      </button>
                    )}
                  </article>
                );
              })}
            </div>
            <p className="checkin__note">Tienes {status.minutes} minutos desde el inicio de cada invasión para marcar. Pasado ese tiempo se cierra. Si olvidas marcar, un oficial puede registrarlo por ti.</p>
          </>
        )}
        {status && (
          <div className="card tz-card">
            <h3>Mi zona horaria</h3>
            <p className="muted">Las invasiones son en hora de Perú ({status.timezone}). Elige tu zona para ver los horarios en tu hora local; las reglas de marcación no cambian.</p>
            <div className="tz-row">
              <input list="tz-list" value={tz} onChange={(e) => setTz(e.target.value)} placeholder="Ej. Europe/Madrid" />
              <datalist id="tz-list">{zoneList().map((z) => <option key={z} value={z} />)}</datalist>
              <button className="btn btn--sm" onClick={() => saveZone(tz)}>Guardar</button>
            </div>
            <div className="tz-row tz-row--links">
              <button className="link plain-btn" onClick={() => setTz(Intl.DateTimeFormat().resolvedOptions().timeZone)}>Detectar la de mi equipo</button>
              <button className="link plain-btn" onClick={() => saveZone('')}>Usar hora de Perú</button>
            </div>
            {tzMsg && <p className="muted" style={{ marginTop: 8 }}>{tzMsg}</p>}
          </div>
        )}
      </section>
    </main>
  );
}
