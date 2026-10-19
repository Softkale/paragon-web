import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../api';

const weekday = (d) => new Date(`${d}T12:00:00`).toLocaleDateString('es', { weekday: 'short' }).replace('.', '');
const fmtDay = (d) => new Date(`${d}T12:00:00`).toLocaleDateString('es', { day: '2-digit', month: '2-digit' });
const longDay = (d) => new Date(`${d}T12:00:00`).toLocaleDateString('es', { weekday: 'long', day: 'numeric', month: 'long' });

const STATE_LABEL = { upcoming: 'Aún no comienza', open: 'Abierta', closed: 'Cerrada' };
const STATE_CLASS = { upcoming: 'pendiente', open: 'activo', closed: 'inactivo' };

// Asistencia por invasión: el día elegido con sus 3 horarios. Los miembros marcan solos en su ventana;
// aquí el oficial ve quién marcó y corrige a quien olvidó.
export default function DaySheet({ sheet, seasonId, day, setDay, onChanged }) {
  const [data, setData] = useState(null);
  const [query, setQuery] = useState('');
  const [view, setView] = useState('all'); // all | in | out
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      setData(await api.get(`/seasons/${seasonId}/day/${day}`));
      setError('');
    } catch (err) {
      setError(err.message);
    }
  }, [seasonId, day]);

  // Recarga al cambiar de día y, si es hoy, cada 15 s para ver las marcas de los miembros en vivo.
  useEffect(() => {
    setData(null);
    load();
    const t = setInterval(() => load(), 15000);
    return () => clearInterval(t);
  }, [load]);

  const perDay = useMemo(() => {
    const map = {};
    sheet.checks.forEach((k) => { const d = k.split('|')[1]; map[d] = (map[d] || 0) + 1; });
    return map;
  }, [sheet.checks]);

  const today = new Date().toISOString().slice(0, 10);

  const toggle = async (slot, player, attended) => {
    const key = `${slot}|${player.id}`;
    setBusy(key);
    try {
      await api.put(`/seasons/${seasonId}/attendance`, { user_id: player.id, day, slot, attended });
      await Promise.all([load(), onChanged()]);
    } catch (err) {
      window.alert(err.message);
    } finally {
      setBusy('');
    }
  };

  const time = (iso) => new Date(iso).toLocaleTimeString('es', { timeZone: data.timezone, hour: '2-digit', minute: '2-digit', hour12: false });
  const q = query.trim().toLowerCase();

  return (
    <>
      <div className="day-strip" role="tablist" aria-label="Días de la temporada">
        {sheet.days.map((d) => (
          <button key={d} role="tab" aria-selected={d === day} className={`day-chip ${d === day ? 'is-on' : ''}`} onClick={() => setDay(d)}>
            <span>{weekday(d)}</span>
            <b>{fmtDay(d)}</b>
            <small>{perDay[d] || 0}</small>
            {d === today && <i title="Hoy" />}
          </button>
        ))}
      </div>

      <div className="toolbar" style={{ margin: '16px 0' }}>
        <h4 className="day-title">{longDay(day)}</h4>
        <div className="form-actions">
          <input className="search" placeholder="Buscar jugador…" value={query} onChange={(e) => setQuery(e.target.value)} />
          <select className="select" value={view} onChange={(e) => setView(e.target.value)}>
            <option value="all">Todos</option>
            <option value="in">Solo asistieron</option>
            <option value="out">Solo faltan</option>
          </select>
        </div>
      </div>
      {error && <p className="form-msg form-msg--error" style={{ marginBottom: 12 }}>{error}</p>}

      {data && (
        <div className="inv-grid">
          {data.slots.map((s) => {
            const marks = Object.fromEntries(s.attendees.map((a) => [a.user_id, a]));
            const rows = data.players.filter((p) => {
              if (q && !p.name.toLowerCase().includes(q)) return false;
              if (view === 'in') return !!marks[p.id];
              if (view === 'out') return !marks[p.id];
              return true;
            });
            const locked = s.state === 'upcoming';
            return (
              <article key={s.slot} className={`card inv-card inv-card--${s.state}`}>
                <header className="inv-card__head">
                  <b>{s.slot}</b>
                  <span className={`status status--${STATE_CLASS[s.state]}`}>{STATE_LABEL[s.state]}{s.override ? ' (manual)' : ''}</span>
                  <span className="inv-card__count"><strong>{s.attendees.length}</strong> asistentes</span>
                </header>
                {locked && <p className="muted inv-card__note">Podrás registrar asistencia cuando comience la invasión.</p>}
                <ul className="att-list">
                  {rows.map((p) => {
                    const rec = marks[p.id];
                    const k = `${s.slot}|${p.id}`;
                    return (
                      <li key={p.id}>
                        <label className={`att-row ${rec ? 'is-on' : ''}`}>
                          <input type="checkbox" checked={!!rec} disabled={(locked && !rec) || busy === k} onChange={(e) => toggle(s.slot, p, e.target.checked)} />
                          <span className="att-row__name">{p.name}</span>
                          {rec && (
                            <span className={`att-badge att-badge--${rec.source}`} title={rec.source === 'self' ? 'Marcó el propio jugador' : `Marcado por ${rec.marked_by}`}>
                              {rec.source === 'self' ? `marcó ${time(rec.marked_at)}` : `${rec.marked_by || 'oficial'} ${time(rec.marked_at)}`}
                            </span>
                          )}
                        </label>
                      </li>
                    );
                  })}
                  {!rows.length && <li className="muted att-empty">Sin jugadores para este filtro.</li>}
                </ul>
              </article>
            );
          })}
        </div>
      )}
      <p className="muted" style={{ marginTop: 10 }}>
        Los miembros marcan solos durante los {data ? data.minutes : 30} minutos de cada invasión. Si alguien olvidó marcar, márcalo aquí:
        queda registrado con tu nombre (insignia dorada) para distinguirlo de las marcas propias.
      </p>
    </>
  );
}
