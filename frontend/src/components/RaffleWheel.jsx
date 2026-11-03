import React, { useEffect, useRef, useState } from 'react';
import { api } from '../api';

const SPIN_MS = 4500;
const pause = (ms) => new Promise((r) => setTimeout(r, ms));

// Punto sobre el círculo; el ángulo se mide en grados desde arriba, en sentido horario.
const point = (deg, r) => {
  const a = (deg * Math.PI) / 180;
  return [r * Math.sin(a), -r * Math.cos(a)];
};

function Wheel({ names, rotation, spinning }) {
  const seg = 360 / names.length;
  const size = Math.max(5, 12 - names.length * 0.45);
  return (
    <div className="wheel">
      <div className="wheel__pointer" />
      <svg viewBox="-100 -100 200 200" className="wheel__svg" style={{ transform: `rotate(${rotation}deg)`, transition: spinning ? `transform ${SPIN_MS}ms cubic-bezier(.12,.6,.1,1)` : 'none' }}>
        {names.map((name, i) => {
          const [x0, y0] = point(i * seg, 96);
          const [x1, y1] = point((i + 1) * seg, 96);
          const mid = (i + 0.5) * seg;
          return (
            <g key={i}>
              <path d={`M0 0 L${x0} ${y0} A96 96 0 0 1 ${x1} ${y1} Z`} fill={i % 2 ? '#1b2335' : '#2c2312'} stroke="#a8752a" strokeWidth="0.8" />
              <text transform={`rotate(${mid - 90})`} x="88" y={size / 3} textAnchor="end" fontSize={size} fill="#f4c66d" fontWeight="600">
                {name.length > 13 ? `${name.slice(0, 12)}…` : name}
              </text>
            </g>
          );
        })}
        <circle r="9" fill="#0b0e14" stroke="#f4c66d" strokeWidth="1.5" />
      </svg>
    </div>
  );
}

// Ruleta del sorteo de cajas sobrantes. El resultado lo decide el servidor (queda guardado);
// la ruleta solo lo muestra girando hasta el ganador.
export default function RaffleWheel({ seasonId, raffle, nameOf, onClose, onDone }) {
  const [remaining, setRemaining] = useState(raffle.candidates);
  const [rotation, setRotation] = useState(0);
  const [spinning, setSpinning] = useState(false);
  const [phase, setPhase] = useState('ready'); // ready | running | done
  const [won, setWon] = useState([]);
  const [error, setError] = useState('');
  const alive = useRef(true);

  useEffect(() => () => { alive.current = false; }, []);
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape' && phase !== 'running') onClose(phase === 'done'); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, phase]);

  const start = async () => {
    setError('');
    setPhase('running');
    let winners;
    try {
      ({ winners } = await api.post(`/seasons/${seasonId}/raffle/${raffle.category}`));
    } catch (err) {
      setError(err.message);
      setPhase('ready');
      return;
    }

    let pool = [...raffle.candidates];
    for (const id of winners) {
      if (!alive.current) return;
      const seg = 360 / pool.length;
      const index = pool.indexOf(id);
      setRemaining(pool);
      setSpinning(false);
      setRotation(0);
      await pause(60);
      // El ganador queda bajo el puntero (arriba), con un poco de holgura para que no caiga siempre al centro.
      const jitter = (Math.random() - 0.5) * seg * 0.6;
      setSpinning(true);
      setRotation(360 * 6 + (360 - (index + 0.5) * seg) + jitter);
      await pause(SPIN_MS + 300);
      if (!alive.current) return;
      setWon((w) => [...w, id]);
      pool = pool.filter((p) => p !== id);
      await pause(900);
    }
    if (!alive.current) return;
    setSpinning(false);
    setPhase('done');
  };

  const close = () => onClose(phase === 'done');
  const label = `${raffle.slots} ${raffle.slots === 1 ? 'caja' : 'cajas'} · ${raffle.name}`;

  return (
    <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget && phase !== 'running') close(); }}>
      <div className="card modal raffle-modal" role="dialog" aria-label="Sorteo de cajas">
        <h3 className="admin-h" style={{ marginBottom: 4 }}>🎰 Sorteo: {label}</h3>
        <p className="muted" style={{ marginBottom: 14 }}>
          Mismo número de asistencias entre {raffle.candidates.length} jugadores; sobran cajas, así que se sortean.
        </p>

        <Wheel names={remaining.map(nameOf)} rotation={rotation} spinning={spinning} />

        {won.length > 0 && (
          <ol className="raffle-winners">
            {won.map((id, i) => <li key={id}><span>Ganador {i + 1}</span> <b>{nameOf(id)}</b> <small>+1 {raffle.name}</small></li>)}
          </ol>
        )}
        {error && <p className="form-msg form-msg--error">{error}</p>}

        <div className="form-actions" style={{ justifyContent: 'center', marginTop: 16 }}>
          {phase === 'ready' && <button className="btn" onClick={start}>🎲 Girar ruleta</button>}
          {phase === 'running' && <button className="btn" disabled>Sorteando…</button>}
          {phase !== 'running' && <button className="icon-btn" onClick={close}>{phase === 'done' ? 'Listo' : 'Cancelar'}</button>}
        </div>
      </div>
    </div>
  );
}
