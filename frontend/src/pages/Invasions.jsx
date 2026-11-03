import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../api';
import LootEntry from '../components/LootEntry';
import DaySheet from '../components/DaySheet';
import AttendanceLog from '../components/AttendanceLog';
import RaffleWheel from '../components/RaffleWheel';
import { DISTRIBUTIONS, blockLabel } from '../components/blocks';

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
      <label className="field">
        <span>Tipo</span>
        <select className="select" value={form.kind} onChange={set('kind')}>
          <option value="liga">Liga</option>
          <option value="libre">Sin liga (las invasiones continúan)</option>
        </select>
      </label>
      <label className="field">
        <span>Reparto de cajas</span>
        <select className="select" value={form.distribution} onChange={set('distribution')}>
          {Object.entries(DISTRIBUTIONS).map(([k, d]) => <option key={k} value={k}>{d.name}</option>)}
        </select>
        <small className="muted">{DISTRIBUTIONS[form.distribution].hint}</small>
      </label>
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
  const [wheel, setWheel] = useState(null); // sorteo abierto en la ruleta
  const [view, setView] = useState('total'); // 'total' o la clave de un bloque de reparto (día o semana)
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
  useEffect(() => { setDay(null); setView('total'); loadSheet(selected); }, [selected, loadSheet]);

  // Día inicial: hoy si está en la temporada; si no, el último día ya transcurrido o el primero.
  useEffect(() => {
    if (!sheet || (day && sheet.days.includes(day))) return;
    const t = today();
    setDay(sheet.days.includes(t) ? t : [...sheet.days].reverse().find((d) => d <= t) || sheet.days[0]);
  }, [sheet, day]);

  const delivered = useMemo(() => new Set(sheet ? sheet.delivered : []), [sheet]);

  const playerById = useMemo(() => Object.fromEntries((sheet ? sheet.players : []).map((p) => [p.id, p])), [sheet]);
  const nameOf = useCallback((id) => playerById[id]?.name || `#${id}`, [playerById]);
  // Bloques de reparto (todo el período, cada semana o cada día) con su nombre legible.
  const blocks = useMemo(() => {
    if (!sheet) return [];
    return sheet.blocks.map((b, i) => ({
      ...b,
      label: blockLabel(sheet.distribution, b.key, b.days?.[0], b.days?.[b.days.length - 1], i + 1),
    }));
  }, [sheet]);
  const blockByKey = useMemo(() => Object.fromEntries(blocks.map((b) => [b.key, b])), [blocks]);
  const activeBlock = view === 'total' ? null : blockByKey[view] || null;

  // Por categoría, los jugadores que participan en un sorteo del bloque que se está viendo (para marcarlos en la tabla).
  const raffleSeats = useMemo(() => {
    const seats = {};
    (sheet ? sheet.raffles : [])
      .filter((r) => !activeBlock || r.bucket === activeBlock.key)
      .forEach((r) => { (seats[r.category] ||= new Set()); r.candidates.forEach((id) => seats[r.category].add(id)); });
    return seats;
  }, [sheet, activeBlock]);

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
    if (!window.confirm('¿Eliminar este período con todas sus asistencias y botín?')) return;
    await api.del(`/seasons/${selected}`);
    const list = await api.get('/seasons');
    setSeasons(list);
    setSelected(list.length ? pickCurrent(list).id : null);
  });

  const undoRaffle = (raffle) => run(async () => {
    if (!window.confirm(`¿Anular el sorteo de ${raffle.name}? Se podrá volver a sortear.`)) return;
    await api.del(`/seasons/${selected}/raffle/${raffle.category}?bucket=${encodeURIComponent(raffle.bucket)}`);
    await loadSheet(selected);
  });

  const setDelivery = (player, value) => run(async () => {
    await api.put(`/seasons/${selected}/delivery`, { user_id: player.id, delivered: value });
    await loadSheet(selected);
  });

  if (!seasons) return <div className="card empty">{error || 'Cargando…'}</div>;

  const last = seasons[0]; // la lista llega ordenada por inicio descendente
  const newDefaults = {
    kind: 'liga',
    distribution: 'periodo',
    name: `Temporada ${seasons.length + 1}`,
    start_date: last ? addDays(last.end_date, 1) : today(),
    weeks: 2,
  };
  const current = seasons.find((s) => s.id === selected);

  return (
    <>
      <div className="toolbar">
        <div className="season-pick">
          {seasons.length > 0 && (
            <select className="select" value={selected || ''} onChange={(e) => { setSelected(Number(e.target.value)); setForm(null); }}>
              {seasons.map((s) => (
                <option key={s.id} value={s.id}>{s.kind === 'libre' ? '[Sin liga] ' : ''}{s.name} · {fmtRange(s)}</option>
              ))}
            </select>
          )}
          {current && <span className="tag">{current.kind === 'libre' ? 'Sin liga · ' : ''}{current.weeks} {current.weeks === 1 ? 'semana' : 'semanas'}</span>}
        </div>
        <div className="form-actions">
          {current && <button className="icon-btn" onClick={() => setForm(form === 'edit' ? null : 'edit')}>✏️ Editar</button>}
          {current && me.role === 'admin' && <button className="icon-btn" onClick={removeSeason}>🗑️</button>}
          <button className="btn btn--sm" onClick={() => setForm(form === 'new' ? null : 'new')}>+ Nuevo período</button>
        </div>
      </div>

      {form === 'new' && <SeasonForm title="Nuevo período (liga o sin liga)" initial={newDefaults} onSave={saveSeason} onCancel={() => setForm(null)} />}
      {form === 'edit' && current && (
        <SeasonForm
          title="Editar temporada"
          initial={{ name: current.name, kind: current.kind, distribution: current.distribution, start_date: current.start_date, weeks: String(current.weeks) }}
          onSave={saveSeason}
          onCancel={() => setForm(null)}
        />
      )}
      {error && <div className="form-msg form-msg--error" style={{ marginBottom: 16 }}>{error}</div>}

      {!current && <div className="card empty">Aún no hay temporadas ni períodos sin liga. Crea el primero con «+ Nuevo período».</div>}

      {current && sheet && (
        <>
          <h3 className="admin-h">Asistencia a invasiones <small className="muted">· 12:00, 17:00 y 21:00 (hora de Perú), todos los días</small></h3>
          {day && <DaySheet key={current.id} canRecord={!!me.canRecord} sheet={sheet} seasonId={current.id} day={day} setDay={setDay} onChanged={() => loadSheet(selected)} />}

          <h3 className="admin-h" style={{ marginTop: 32 }}>Historial de registros <small className="muted">· quién anotó o quitó cada asistencia</small></h3>
          <AttendanceLog seasonId={current.id} version={sheet.checks.length} />

          <h3 className="admin-h" style={{ marginTop: 32 }}>Botín por invasión</h3>
          {day && <LootEntry key={`${current.id}-${sheet.days[0]}`} sheet={sheet} seasonId={current.id} day={day} onSaved={() => loadSheet(selected)} />}
          <h4 className="control-sub">Total de la temporada</h4>
          <div className="loot-totals">
            {sheet.lootNames.map((n, i) => (
              <div key={n} className="card loot-chip"><span>{n}</span><strong>{sheet.inventory[i]}</strong></div>
            ))}
          </div>

          {sheet.raffles.length > 0 && (
            <>
              <h3 className="admin-h" style={{ marginTop: 32 }}>
                🎲 Cajas por sortear
                <small className="muted"> · sobran cajas entre jugadores con la misma asistencia; se definen por sorteo</small>
              </h3>
              <div className="raffle-list">
                {sheet.raffles.map((r) => (
                  <article key={`${r.bucket}|${r.category}`} className={`card raffle${r.winners ? ' raffle--done' : ''}`}>
                    <header className="raffle__head">
                      <div>
                        <strong>{r.slots} {r.slots === 1 ? 'caja' : 'cajas'} · {r.name}</strong>
                        {sheet.distribution !== 'periodo' && <span className="tag" style={{ marginLeft: 8 }}>{blockByKey[r.bucket]?.label}</span>}
                        <span className="muted"> entre {r.candidates.length} jugadores con {blockByKey[r.bucket]?.counts[r.candidates[0]]} asistencias</span>
                      </div>
                      {r.winners
                        ? <span className="tag">Sorteado</span>
                        : <button className="btn btn--sm" onClick={() => setWheel(r)}>🎰 Girar ruleta</button>}
                    </header>
                    <ul className="raffle__people">
                      {r.candidates.map((id) => {
                        const state = !r.winners ? 'pending' : r.winners.includes(id) ? 'won' : 'lost';
                        return (
                          <li key={id} className={`raffle__person raffle__person--${state}`}>
                            {nameOf(id)}{state === 'won' && ' ★'}
                          </li>
                        );
                      })}
                    </ul>
                    {r.winners && me.role === 'admin' && (
                      <button className="icon-btn raffle__undo" onClick={() => undoRaffle(r)}>Anular sorteo</button>
                    )}
                  </article>
                ))}
              </div>
            </>
          )}
          {wheel && (
            <RaffleWheel
              seasonId={current.id}
              raffle={wheel}
              blockLabel={sheet.distribution !== 'periodo' ? blockByKey[wheel.bucket]?.label : ''}
              nameOf={nameOf}
              onClose={(changed) => { setWheel(null); if (changed) loadSheet(selected); }}
            />
          )}

          <h3 className="admin-h" style={{ marginTop: 32 }}>
            Reparto de cajas · {DISTRIBUTIONS[sheet.distribution].name.toLowerCase()}
            <small className="muted"> · {DISTRIBUTIONS[sheet.distribution].hint}; 🎲 = participa en un sorteo{!activeBlock && '; la casilla confirma la entrega'}</small>
          </h3>
          {blocks.length > 1 && (
            <div className="season-pick" style={{ marginBottom: 12 }}>
              <select className="select" value={activeBlock ? activeBlock.key : 'total'} onChange={(e) => setView(e.target.value)}>
                <option value="total">Total de la temporada (suma de {blocks.length} repartos)</option>
                {blocks.map((b) => <option key={b.key} value={b.key}>{b.label}{b.idle ? ' · sin asistentes' : ''}</option>)}
              </select>
            </div>
          )}
          {(activeBlock ? [activeBlock] : blocks).some((b) => b.idle) && (
            <p className="form-msg form-msg--error" style={{ marginBottom: 12 }}>
              Hay botín sin asistentes en: {(activeBlock ? [activeBlock] : blocks).filter((b) => b.idle).map((b) => b.label).join(', ')}. No se puede repartir hasta registrar asistencia.
            </p>
          )}
          <div className="card table-wrap">
            <table className="table">
              <thead>
                <tr><th>Jugador</th><th>Asist.</th>{sheet.lootNames.map((n) => <th key={n}>{n}</th>)}<th>Total</th>{!activeBlock && <th>Entregado</th>}</tr>
              </thead>
              <tbody>
                {sheet.players.filter((p) => (activeBlock ? activeBlock.counts[p.id] : p.count) > 0).map((p) => {
                  const row = (activeBlock ? activeBlock.allocation : sheet.allocation)[p.id];
                  return (
                    <tr key={p.id}>
                      <td><b>{p.name}</b></td>
                      <td>{activeBlock ? activeBlock.counts[p.id] : p.count}</td>
                      {row.map((n, i) => (
                        <td key={i} className="reward">
                          {n}
                          {raffleSeats[i]?.has(p.id) && <span className="raffle-mark" title="Participa en el sorteo de las cajas sobrantes de esta categoría"> 🎲</span>}
                        </td>
                      ))}
                      <td><b>{row.reduce((a, b) => a + b, 0)}</b></td>
                      {!activeBlock && <td><input type="checkbox" checked={delivered.has(p.id)} onChange={(e) => setDelivery(p, e.target.checked)} /></td>}
                    </tr>
                  );
                })}
                <tr className="totalrow">
                  <td colSpan="2">TOTALES</td>
                  {(activeBlock ? activeBlock.inventory : sheet.inventory).map((n, i) => <td key={i}>{n}</td>)}
                  <td>{(activeBlock ? activeBlock.inventory : sheet.inventory).reduce((a, b) => a + b, 0)}</td>
                  {!activeBlock && <td>{sheet.players.filter((p) => p.count > 0 && delivered.has(p.id)).length} / {sheet.players.filter((p) => p.count > 0).length}</td>}
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
