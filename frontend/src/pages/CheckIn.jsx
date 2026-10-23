import React, { useEffect, useState } from 'react';
import { Redirect } from 'react-router-dom';
import Embers from '../components/Embers';
import MemberBar from '../components/MemberBar';
import { api } from '../api';
import { useAuth } from '../AuthContext';

const fmtDay = (d) => new Date(`${d}T12:00:00`).toLocaleDateString('es', { weekday: 'short', day: 'numeric', month: 'short' });
const fmtShort = (d) => new Date(`${d}T12:00:00`).toLocaleDateString('es', { day: '2-digit', month: '2-digit' });

// Reporte personal: a qué invasiones asististe (las anota el oficial designado) y cuántas cajas te tocan.
export default function CheckIn() {
  const { user, loading } = useAuth();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState(null);

  useEffect(() => {
    if (!user || user.mustChange) return;
    api.get('/invasions/mine')
      .then((r) => {
        setData(r);
        setSelected((cur) => cur || (r.seasons.find((s) => s.current) || r.seasons[0] || {}).id || null);
      })
      .catch((err) => setError(err.message));
  }, [user]);

  if (loading) return null;
  if (!user) return <Redirect to="/login" />;
  if (user.mustChange) return <Redirect to="/cambiar-clave" />;

  const season = data && data.seasons.find((s) => s.id === selected);

  return (
    <main className="checkin">
      <Embers count={25} />
      <MemberBar />

      <section className="checkin__body">
        <h1>Mi reporte de invasiones</h1>
        <p className="checkin__date">La asistencia la registra el oficial designado; aquí ves lo que tiene anotado de ti.</p>
        {error && <p className="form-msg form-msg--error">{error}</p>}

        {data && !data.seasons.length && <div className="card empty">Todavía no hay temporadas ni períodos registrados.</div>}

        {data && season && (
          <>
            <div className="season-pick" style={{ margin: '12px 0 20px' }}>
              <select className="select" value={selected} onChange={(e) => setSelected(Number(e.target.value))}>
                {data.seasons.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.kind === 'libre' ? 'Sin liga' : 'Liga'} · {s.name} · {fmtShort(s.start_date)} al {fmtShort(s.end_date)}
                  </option>
                ))}
              </select>
              <span className="tag">{season.kind === 'libre' ? 'Sin liga' : 'Liga'}</span>
            </div>

            <p className="checkin__season">
              Llevas <b>{season.attendances}</b> de {season.opportunities} asistencias
              ({Math.round((season.attendances / season.opportunities) * 100)}%)
            </p>

            <h3 className="admin-h">Cajas que te tocan</h3>
            <div className="loot-totals">
              {data.lootNames.map((n, i) => (
                <div key={n} className="card loot-chip"><span>{n}</span><strong>{season.boxes[i]}</strong></div>
              ))}
              <div className="card loot-chip"><span>Total</span><strong>{season.totalBoxes}</strong></div>
            </div>
            {season.totalBoxes > 0 && (
              <p className="muted" style={{ marginTop: 8 }}>{season.delivered ? '✓ Tu reparto ya fue entregado.' : 'Tu reparto aún no ha sido entregado.'}</p>
            )}
            <p className="muted" style={{ marginTop: 6 }}>El reparto es proporcional a tus asistencias y puede cambiar mientras se sigan registrando invasiones.</p>

            <h3 className="admin-h" style={{ marginTop: 28 }}>Horarios a los que asististe</h3>
            <div className="slot-grid">
              {data.slots.map((slot) => (
                <article key={slot} className="card slot slot--done">
                  <span className="slot__time">{slot}</span>
                  <span className="slot__peru">hora de Perú</span>
                  <p className="slot__msg"><b>{season.bySlot[slot]}</b> {season.bySlot[slot] === 1 ? 'asistencia' : 'asistencias'}</p>
                </article>
              ))}
            </div>

            <div className="card table-wrap" style={{ marginTop: 16 }}>
              <table className="table">
                <thead><tr><th>Día</th><th>Horario</th></tr></thead>
                <tbody>
                  {season.attended.map((a) => <tr key={`${a.day}|${a.slot}`}><td>{fmtDay(a.day)}</td><td>{a.slot}</td></tr>)}
                  {!season.attended.length && <tr><td colSpan="2" className="muted">Aún no tienes asistencias anotadas en este período.</td></tr>}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>
    </main>
  );
}
