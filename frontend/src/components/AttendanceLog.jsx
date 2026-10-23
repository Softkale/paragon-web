import React, { useEffect, useState } from 'react';
import { api } from '../api';

const when = (iso) => new Date(iso).toLocaleString('es', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false });
const fmtDay = (d) => new Date(`${d}T12:00:00`).toLocaleDateString('es', { day: '2-digit', month: '2-digit' });

// Historial de quién anotó o quitó la asistencia de cada PJ. `version` cambia cuando se registra algo y recarga la lista.
export default function AttendanceLog({ seasonId, version }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get(`/seasons/${seasonId}/attendance-log`).then((r) => { setData(r); setError(''); }).catch((e) => setError(e.message));
  }, [seasonId, version]);

  if (error) return <p className="form-msg form-msg--error">{error}</p>;
  if (!data) return null;

  return (
    <>
      <div className="loot-totals">
        {data.summary.map((s) => (
          <div key={s.actor_name} className="card loot-chip" title={`Último registro: ${when(s.last_at)}`}>
            <span>{s.actor_name}</span><strong>{s.marks}</strong>
            <small className="muted">{s.removals ? `${s.removals} retiradas` : 'marcas'}</small>
          </div>
        ))}
        {!data.summary.length && <p className="muted">Aún no hay registros en este período.</p>}
      </div>
      {data.log.length > 0 && (
        <div className="card table-wrap" style={{ marginTop: 12, maxHeight: 360, overflow: 'auto' }}>
          <table className="table">
            <thead><tr><th>Cuándo</th><th>Oficial</th><th>Acción</th><th>PJ</th><th>Invasión</th></tr></thead>
            <tbody>
              {data.log.map((r) => (
                <tr key={r.id}>
                  <td>{when(r.created_at)}</td>
                  <td><b>{r.actor_name}</b></td>
                  <td>{r.action === 'marcar' ? '✓ marcó' : '✕ quitó'}</td>
                  <td>{r.player_name}</td>
                  <td>{fmtDay(r.day)} · {r.slot}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
