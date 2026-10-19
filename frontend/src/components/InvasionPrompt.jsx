import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../AuthContext';

const REMIND_MS = 5 * 60 * 1000; // si lo posponen, vuelve a saltar a los 5 minutos mientras siga abierta
const SKIP_PAGES = ['/login', '/restablecer', '/cambiar-clave'];

const pad = (n) => String(n).padStart(2, '0');
const clock = (sec) => `${pad(Math.floor(Math.max(0, sec) / 60))}:${pad(Math.floor(Math.max(0, sec) % 60))}`;

// Ventana que salta sola cuando hay una invasión abierta y el usuario aún no marcó: lo primero que debe hacer.
export default function InvasionPrompt() {
  const { user } = useAuth();
  const { pathname } = useLocation();
  const active = !!user && !user.mustChange && !SKIP_PAGES.includes(pathname);

  const [status, setStatus] = useState(null);
  const [snoozed, setSnoozed] = useState({}); // `${día}|${horario}` -> hasta cuándo está pospuesta
  const [done, setDone] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [, setTick] = useState(0);
  const fetchedAt = useRef(Date.now());

  const load = useCallback(async () => {
    try {
      const s = await api.get('/invasions/status');
      fetchedAt.current = Date.now();
      setStatus(s);
    } catch {
      /* sin conexión: reintenta en el siguiente ciclo */
    }
  }, []);

  useEffect(() => {
    if (!active) { setStatus(null); return undefined; }
    load();
    const poll = setInterval(load, 15000);
    const tick = setInterval(() => setTick((t) => t + 1), 1000);
    const onCheckin = () => load();
    window.addEventListener('paragon:checkin', onCheckin);
    return () => { clearInterval(poll); clearInterval(tick); window.removeEventListener('paragon:checkin', onCheckin); };
  }, [active, load]);

  const elapsed = (Date.now() - fetchedAt.current) / 1000;
  const open = status && status.season ? status.slots.find((s) => s.state === 'open' && !s.checked) : null;
  const key = open ? `${status.now.day}|${open.slot}` : '';
  const hidden = key && snoozed[key] && snoozed[key] > Date.now();
  const left = open && open.remaining !== null ? open.remaining - elapsed : null;

  // Cuando se acaba el tiempo, pide el estado real al servidor.
  useEffect(() => {
    if (left !== null && left <= 0) load();
  });

  // Con la ventana abierta, Escape la pospone.
  useEffect(() => {
    if (!open || hidden) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') setSnoozed((s) => ({ ...s, [key]: Date.now() + REMIND_MS })); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, hidden, key]);

  const mark = async () => {
    setBusy(true);
    setError('');
    try {
      await api.post('/invasions/checkin', { slot: open.slot });
      setDone(open.localTime);
      window.dispatchEvent(new Event('paragon:checkin'));
      await load();
      setTimeout(() => setDone(null), 2600);
    } catch (err) {
      setError(err.message);
      await load();
    } finally {
      setBusy(false);
    }
  };

  if (!active) return null;

  if (done) {
    return (
      <div className="modal-backdrop" role="status">
        <div className="modal card invasion-modal invasion-modal--done">
          <div className="invasion-modal__check">✓</div>
          <h2>¡Asistencia registrada!</h2>
          <p className="muted">Invasión de las {done}. ¡Buena suerte!</p>
        </div>
      </div>
    );
  }

  if (!open || hidden) return null;

  const abroad = status.userTimezone && status.userTimezone !== status.timezone;

  return (
    <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) setSnoozed((s) => ({ ...s, [key]: Date.now() + REMIND_MS })); }}>
      <div className="modal card invasion-modal" role="alertdialog" aria-modal="true" aria-label="Marcar asistencia a la invasión">
        <p className="invasion-modal__kicker">⚔️ ¡Hay invasión!</p>
        <h2>Marca tu asistencia</h2>
        <div className="invasion-modal__time">{open.localTime}</div>
        {abroad && <p className="muted">{open.slot} hora de Perú{open.dayOffset ? ` · ${open.dayOffset > 0 ? 'mañana' : 'ayer'} para ti` : ''}</p>}
        <p className="invasion-modal__left">
          {left !== null ? <>Cierra en <b>{clock(left)}</b></> : 'Abierta por un oficial'}
        </p>
        {error && <p className="form-msg form-msg--error">{error}</p>}
        <button className="btn btn--block invasion-modal__btn" onClick={mark} disabled={busy}>{busy ? 'Marcando…' : 'Marcar asistencia'}</button>
        <button className="link plain-btn" onClick={() => setSnoozed((s) => ({ ...s, [key]: Date.now() + REMIND_MS }))}>Ahora no (te lo recordaré en 5 min)</button>
      </div>
    </div>
  );
}
