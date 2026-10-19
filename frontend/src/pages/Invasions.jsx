import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../api';
import CheckinControl from '../components/CheckinControl';
import LootEntry from '../components/LootEntry';
import DaySheet from '../components/DaySheet';

const today = () => new Date().toISOString().slice(0, 10);
const addDays = (s, n) => {
  const d = new Date(`${s}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const fmtDay = (s) => new Date(`${s}T12:00:00`).toLocaleDateString('es', { day: '2-digit', month: '2-digit' });
const fmtRange = (s) => `${fmtDay(s.start_date)} al ${fmtDay(s.end_date)}`;

// Temporada vigente hoy; si no hay, la más reciente.
const pickCurrent = (list) => list.find((s) => s.start_date <= today() && today() <= s.end_date) || list[0];

function SeasonForm({ initial, onSave, onCancel, title }) {
  const [form, setForm] = useState(initial);
  const [error, setError] = useState('');
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    try {
      await onSave({ ...form, weeks: Number(form.weeks) });
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <form className="card form-grid" onSubmit={submit} style={{ marginBottom: 20 }}>
      <h3 className="admin-h field--wide" style={{ margin: 0 }}>{title}</h3>
      <label className="field"><span>Nombre</span><input value={form.name} onChange={set('name')} required /></label>
      <label className="field"><span>Inicio</span><input type="date" value={form.start_date} onChange={set('start_date')} required /></label>
      <label className="field">
        <span>Duración</span>
        <select className="select" value={form.weeks} onChange={set('weeks')}>
          <option value="1">1 semana</option>
          <option value="2">2 semanas</option>
          <option value="3">3 semanas</option>
          <option value="4">4 semanas</option>
        </select>
      </label>
      <div className="form-actions">
        <button className="btn btn--sm" type="submit">Guardar</button>
        <button type="button" className="icon-btn" onClick={onCancel}>Cancelar</button>
      </div>
      {error && <p className="form-msg form-msg--error field--wide">{error}</p>}
    </form>
  );
}

export default function Invasions({ me }) {
  const [seasons, setSeasons] = useState(null);
  const [selected, setSelected] = useState(null);
  const [sheet, setSheet] = useState(null);
  const [day, setDay] = useState(null);
  const [form, setForm] = useState(null); // null | 'new' | 'edit'
  const [error, setError] = useState('');
  const loadSeasons = useCallback(async (selectId) => {
    const list = await api.get('/seasons');
    setSeasons(list);
    setSelected((cur) => selectId || cur || (pickCurrent(list) || {}).id || null);
  }, []);

  const loadSheet = useCallback(async (id) => {
    if (!id) return setSheet(null);
    try {
      setSheet(await api.get(`/seasons/${id}/sheet`));
      setError('');
    } catch (err) {
      setError(err.message);
    }
  }, []);

  useEffect(() => { loadSeasons().catch((e) => setError(e.message)); }, [loadSeasons]);
  useEffect(() => { setDay(null); loadSheet(selected); }, [selected, loadSheet]);

  // Día inicial: hoy si está en la temporada; si no, el último día ya transcurrido o el primero.
  useEffect(() => {
    if (!sheet || (day && sheet.days.includes(day))) return;
    const t = today();
    setDay(sheet.days.includes(t) ? t : [...sheet.days].reverse().find((d) => d <= t) || sheet.days[0]);
  }, [sheet, day]);

  const delivered = useMemo(() => new Set(sheet ? sheet.delivered : []), [sheet]);

  const run = async (fn) => {
    try { await fn(); } catch (err) { window.alert(err.message); }
  };

  const saveSeason = async (data) => {
    const saved = form === 'edit'
      ? await api.put(`/seasons/${selected}`, data)
      : await api.post('/seasons', data);
    setForm(null);
    await loadSeasons(saved.id);
    await loadSheet(saved.id);
  };

  const removeSeason = () => run(async () => {
    if (!window.confirm('¿Eliminar esta temporada con todas sus asistencias y botín?')) return;
    await api.del(`/seasons/${selected}`);
    const list = await api.get('/seasons');
    setSeasons(list);
    setSelected(list.length ? pickCurrent(list).id : null);
  });

  const setDelivery = (player, value) => run(async () => {
    await api.put(`/seasons/${selected}/delivery`, { user_id: player.id, delivered: value });
    await loadSheet(selected);
  });

  if (!seasons) return <div className="card empty">{error || 'Cargando…'}</div>;

  const last = seasons[0]; // la lista llega ordenada por inicio descendente
  const newDefaults = {
    name: `Temporada ${seasons.length + 1}`,
    start_date: last ? addDays(last.end_date, 1) : today(),
    weeks: 2,
  };
  const current = seasons.find((s) => s.id === selected);

  return (
    <>
      <CheckinControl />
      <div className="toolbar">
        <div className="season-pick">
          {seasons.length > 0 && (
            <select className="select" value={selected || ''} onChange={(e) => { setSelected(Number(e.target.value)); setForm(null); }}>
              {seasons.map((s) => (
                <option key={s.id} value={s.id}>{s.name} · {fmtRange(s)}</option>
              ))}
            </select>
          )}
          {current && <span className="tag">{current.weeks} {current.weeks === 1 ? 'semana' : 'semanas'}</span>}
        </div>
        <div className="form-actions">
          {current && <button className="icon-btn" onClick={() => setForm(form === 'edit' ? null : 'edit')}>✏️ Editar</button>}
          {current && me.role === 'admin' && <button className="icon-btn" onClick={removeSeason}>🗑️</button>}
          <button className="btn btn--sm" onClick={() => setForm(form === 'new' ? null : 'new')}>+ Nueva temporada</button>
        </div>
      </div>

      {form === 'new' && <SeasonForm title="Nueva temporada" initial={newDefaults} onSave={saveSeason} onCancel={() => setForm(null)} />}
      {form === 'edit' && current && (
        <SeasonForm
          title="Editar temporada"
          initial={{ name: current.name, start_date: current.start_date, weeks: String(current.weeks) }}
          onSave={saveSeason}
          onCancel={() => setForm(null)}
        />
      )}
      {error && <div className="form-msg form-msg--error" style={{ marginBottom: 16 }}>{error}</div>}

      {!current && <div className="card empty">Aún no hay temporadas. Crea la primera con «+ Nueva temporada».</div>}

      {current && sheet && (
        <>
          <h3 className="admin-h">Asistencia a invasiones <small className="muted">· 12:00, 17:00 y 21:00 (hora de Perú), todos los días</small></h3>
          {day && <DaySheet key={current.id} sheet={sheet} seasonId={current.id} day={day} setDay={setDay} onChanged={() => loadSheet(selected)} />}

          <h3 className="admin-h" style={{ marginTop: 32 }}>Botín por invasión</h3>
          {day && <LootEntry key={`${current.id}-${sheet.days[0]}`} sheet={sheet} seasonId={current.id} day={day} onSaved={() => loadSheet(selected)} />}
          <h4 className="control-sub">Total de la temporada</h4>
          <div className="loot-totals">
            {sheet.lootNames.map((n, i) => (
              <div key={n} className="card loot-chip"><span>{n}</span><strong>{sheet.inventory[i]}</strong></div>
            ))}
          </div>

          <h3 className="admin-h" style={{ marginTop: 32 }}>
            Reparto de cajas
            <small className="muted"> · proporcional a las asistencias; la casilla confirma la entrega</small>
          </h3>
          <div className="card table-wrap">
            <table className="table">
              <thead>
                <tr><th>Jugador</th><th>Asist.</th>{sheet.lootNames.map((n) => <th key={n}>{n}</th>)}<th>Total</th><th>Entregado</th></tr>
              </thead>
              <tbody>
                {sheet.players.filter((p) => p.count > 0).map((p) => {
                  const row = sheet.allocation[p.id];
                  return (
                    <tr key={p.id}>
                      <td><b>{p.name}</b></td>
                      <td>{p.count}</td>
                      {row.map((n, i) => <td key={i} className="reward">{n}</td>)}
                      <td><b>{row.reduce((a, b) => a + b, 0)}</b></td>
                      <td><input type="checkbox" checked={delivered.has(p.id)} onChange={(e) => setDelivery(p, e.target.checked)} /></td>
                    </tr>
                  );
                })}
                <tr className="totalrow">
                  <td colSpan="2">TOTALES</td>
                  {sheet.inventory.map((n, i) => <td key={i}>{n}</td>)}
                  <td>{sheet.inventory.reduce((a, b) => a + b, 0)}</td>
                  <td>{sheet.players.filter((p) => p.count > 0 && delivered.has(p.id)).length} / {sheet.players.filter((p) => p.count > 0).length}</td>
                </tr>
              </tbody>
            </table>
          </div>
          {sheet.players.every((p) => p.count === 0) && (
            <p className="muted" style={{ marginTop: 10 }}>Sin asistencias registradas no se reparte nada.</p>
          )}
        </>
      )}
    </>
  );
}
