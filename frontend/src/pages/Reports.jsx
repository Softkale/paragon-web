import React, { useEffect, useMemo, useState } from 'react';
import { api, download } from '../api';
import { ColumnChart, HBarChart, Heatmap, StatTile, TipProvider } from '../components/charts';

const WEEKDAYS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
const n = (v) => (Number.isInteger(v) ? v.toLocaleString('es') : v.toLocaleString('es', { maximumFractionDigits: 2 }));
const fmtDay = (d) => new Date(`${d}T12:00:00`).toLocaleDateString('es', { day: '2-digit', month: '2-digit' });
const dayName = (d) => WEEKDAYS[(new Date(`${d}T12:00:00`).getDay() + 6) % 7];
const maxBy = (list, key) => list.reduce((best, x) => (x[key] > (best ? best[key] : -1) ? x : best), null);

function Section({ title, hint, children }) {
  return (
    <section className="report-section">
      <h3 className="admin-h">{title}{hint && <small className="muted"> · {hint}</small>}</h3>
      {children}
    </section>
  );
}

function ChartCard({ title, children }) {
  return (
    <div className="card chart-card">
      <h4>{title}</h4>
      {children}
    </div>
  );
}

export default function Reports() {
  const [seasons, setSeasons] = useState(null);
  const [selected, setSelected] = useState(null);
  const [report, setReport] = useState(null);
  const [compare, setCompare] = useState([]);
  const [error, setError] = useState('');
  const [sort, setSort] = useState('total');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    Promise.all([api.get('/seasons'), api.get('/reports/seasons')])
      .then(([list, cmp]) => {
        setSeasons(list);
        setCompare(cmp.reverse());
        const today = new Date().toISOString().slice(0, 10);
        const current = list.find((s) => s.start_date <= today && today <= s.end_date) || list[0];
        setSelected(current ? current.id : null);
      })
      .catch((e) => setError(e.message));
  }, []);

  useEffect(() => {
    if (!selected) return;
    setLoading(true);
    api.get(`/reports/season/${selected}`)
      .then((r) => { setReport(r); setError(''); })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [selected]);

  const exportCsv = (type) => {
    download(`/reports/season/${selected}/export?type=${type}`, `PARAGON_${report.season.name}_${type}.csv`).catch((e) => window.alert(e.message));
  };

  const players = useMemo(() => {
    if (!report) return [];
    const list = [...report.players];
    if (sort === 'name') return list.sort((a, b) => a.name.localeCompare(b.name, 'es'));
    if (sort === 'boxes') return list.sort((a, b) => b.boxesShare - a.boxesShare || b.total - a.total);
    return list.sort((a, b) => b.total - a.total || a.name.localeCompare(b.name, 'es'));
  }, [report, sort]);

  if (error && !report) return <div className="card empty">{error}</div>;
  if (!seasons) return <div className="card empty">Cargando…</div>;
  if (!seasons.length) return <div className="card empty">Aún no hay temporadas. Crea una en «Invasiones» para ver reportes.</div>;
  if (!report) return <div className="card empty">Cargando reporte…</div>;

  const { totals: T, slots, lootNames, kundumCount } = report;
  const held = report.byInvasion.filter((i) => i.held);
  const bestSlot = maxBy(report.bySlot, 'avgAttendance');
  const bestDay = maxBy(report.byDay, 'attendances');
  const bestWeekday = maxBy(report.byWeekday.filter((w) => w.days), 'avgAttendance');
  const richest = maxBy(held, 'boxes');
  const absent = report.players.filter((p) => p.total === 0).length;
  const top = [...report.players].sort((a, b) => b.total - a.total)[0];

  return (
    <TipProvider>
      <div className={loading ? 'is-loading' : ''}>
        <div className="toolbar">
          <div className="season-pick">
            <select className="select" value={selected} onChange={(e) => setSelected(Number(e.target.value))}>
              {seasons.map((s) => <option key={s.id} value={s.id}>{s.name} · {fmtDay(s.start_date)} al {fmtDay(s.end_date)}</option>)}
            </select>
            <span className="tag">{report.season.weeks} {report.season.weeks === 1 ? 'semana' : 'semanas'}</span>
          </div>
          <div className="form-actions">
            <button className="icon-btn" onClick={() => exportCsv('invasions')}>⬇ CSV por invasión</button>
            <button className="icon-btn" onClick={() => exportCsv('players')}>⬇ CSV por jugador</button>
          </div>
        </div>

        <div className="stat-row">
          <StatTile hero label="Total de cajas de la temporada" value={n(T.boxes)} sub={`${n(T.avgBoxesPerInvasion)} por invasión · ${n(T.boxesPerAttendance)} por asistencia`} />
          <StatTile label={`Cajas Kundum (+1 a +${kundumCount})`} value={n(T.kundum)} sub={T.boxes ? `${Math.round((T.kundum / T.boxes) * 100)}% del total` : '—'} />
          <StatTile label="Asistencias" value={n(T.attendances)} sub={`${n(T.uniquePlayers)} jugadores distintos`} />
          <StatTile label="Promedio por invasión" value={n(T.avgAttendance)} sub={`${T.invasionsHeld} de ${T.invasionsTotal} invasiones con registro`} />
          <StatTile label="Participación" value={`${n(T.participationPct)}%`} sub={`${T.roster} jugadores · ${report.opportunities} invasiones posibles`} />
        </div>

        <Section title="Destacados">
          <ul className="card highlights">
            {bestSlot && bestSlot.attendances > 0 && <li>Horario con más asistentes: <b>{bestSlot.slot}</b> ({n(bestSlot.avgAttendance)} por invasión).</li>}
            {bestDay && bestDay.attendances > 0 && <li>Día con más asistencias: <b>{dayName(bestDay.day)} {fmtDay(bestDay.day)}</b> ({bestDay.attendances}).</li>}
            {bestWeekday && bestWeekday.attendances > 0 && <li>Mejor día de la semana en promedio: <b>{WEEKDAYS[bestWeekday.weekday]}</b> ({n(bestWeekday.avgAttendance)} asistentes por día).</li>}
            {richest && richest.boxes > 0 && <li>Invasión con más cajas: <b>{dayName(richest.day)} {fmtDay(richest.day)} {richest.slot}</b> ({richest.boxes} cajas, {richest.kundum} Kundum).</li>}
            {top && top.total > 0 && <li>Mayor asistencia: <b>{top.name}</b> con {top.total} de {report.opportunities} ({top.pct}%).</li>}
            <li>Jugadores sin ninguna asistencia: <b>{absent}</b> de {T.roster}.</li>
            <li>Entregas del reparto: <b>{T.deliveredCount}</b> de {T.toDeliverCount} jugadores con cajas asignadas.</li>
          </ul>
        </Section>

        <Section title="Cajas por categoría" hint="Kundum +1 a +5 y otras">
          <div className="grid-2">
            <ChartCard title="Total por categoría">
              <HBarChart data={lootNames.map((name, i) => ({ label: name, value: T.byCategory[i], title: name, rows: [{ label: 'Cajas', value: n(T.byCategory[i]) }, { label: 'Del total', value: T.boxes ? `${Math.round((T.byCategory[i] / T.boxes) * 100)}%` : '—' }] }))} />
            </ChartCard>
            <div className="card table-wrap">
              <table className="table">
                <thead><tr><th>Categoría</th><th>Cajas</th><th>%</th></tr></thead>
                <tbody>
                  {lootNames.map((name, i) => (
                    <tr key={name} className={i === kundumCount - 1 ? 'row-sep' : ''}>
                      <td>{name}</td><td className="reward">{n(T.byCategory[i])}</td><td>{T.boxes ? Math.round((T.byCategory[i] / T.boxes) * 100) : 0}%</td>
                    </tr>
                  ))}
                  <tr className="totalrow"><td>Total</td><td>{n(T.boxes)}</td><td>100%</td></tr>
                </tbody>
              </table>
            </div>
          </div>
        </Section>

        <Section title="Por horario" hint="12:00, 17:00 y 21:00 (hora de Perú)">
          <div className="grid-2">
            <ChartCard title="Asistencias por horario">
              <ColumnChart data={report.bySlot.map((s) => ({ label: s.slot, value: s.attendances, title: `Invasión de las ${s.slot}`, rows: [{ label: 'Asistencias', value: n(s.attendances) }, { label: 'Promedio por invasión', value: n(s.avgAttendance) }] }))} />
            </ChartCard>
            <ChartCard title="Cajas por horario">
              <ColumnChart data={report.bySlot.map((s) => ({ label: s.slot, value: s.boxes, title: `Invasión de las ${s.slot}`, rows: [{ label: 'Cajas', value: n(s.boxes) }, { label: 'Kundum', value: n(s.kundum) }, { label: 'Por asistente', value: n(s.boxesPerAttendee) }] }))} />
            </ChartCard>
          </div>
          <div className="card table-wrap" style={{ marginTop: 18 }}>
            <table className="table">
              <thead><tr><th>Horario</th><th>Invasiones</th><th>Asistencias</th><th>Prom. asistentes</th><th>Cajas</th><th>Kundum</th><th>Prom. cajas</th><th>Cajas / asistente</th>{Array.from({ length: kundumCount }, (_, i) => <th key={i}>{lootNames[i]}</th>)}</tr></thead>
              <tbody>
                {report.bySlot.map((s) => (
                  <tr key={s.slot}>
                    <td><b>{s.slot}</b></td><td>{s.invasionsHeld}</td><td>{n(s.attendances)}</td><td>{n(s.avgAttendance)}</td>
                    <td className="reward">{n(s.boxes)}</td><td>{n(s.kundum)}</td><td>{n(s.avgBoxes)}</td><td>{n(s.boxesPerAttendee)}</td>
                    {s.byCategory.slice(0, kundumCount).map((q, i) => <td key={i}>{q}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>

        <Section title="Por día">
          <div className="grid-2">
            <ChartCard title="Asistencias por día">
              <ColumnChart data={report.byDay.map((d) => ({ label: fmtDay(d.day), value: d.attendances, title: `${dayName(d.day)} ${fmtDay(d.day)}`, rows: [{ label: 'Asistencias', value: n(d.attendances) }, { label: 'Jugadores distintos', value: n(d.uniquePlayers) }] }))} />
            </ChartCard>
            <ChartCard title="Cajas por día">
              <ColumnChart data={report.byDay.map((d) => ({ label: fmtDay(d.day), value: d.boxes, title: `${dayName(d.day)} ${fmtDay(d.day)}`, rows: [{ label: 'Cajas', value: n(d.boxes) }, { label: 'Kundum', value: n(d.kundum) }] }))} />
            </ChartCard>
          </div>
          <div className="card table-wrap" style={{ marginTop: 18 }}>
            <table className="table">
              <thead>
                <tr><th>Día</th>{slots.map((s) => <th key={s}>Asist. {s}</th>)}<th>Asistencias</th><th>Jugadores</th>{slots.map((s) => <th key={s}>Cajas {s}</th>)}<th>Cajas</th><th>Kundum</th></tr>
              </thead>
              <tbody>
                {report.byDay.map((d) => (
                  <tr key={d.day}>
                    <td><b>{dayName(d.day)} {fmtDay(d.day)}</b></td>
                    {slots.map((s) => <td key={s}>{d.bySlot[s].attendees}</td>)}
                    <td>{d.attendances}</td><td>{d.uniquePlayers}</td>
                    {slots.map((s) => <td key={s}>{d.bySlot[s].boxes}</td>)}
                    <td className="reward">{d.boxes}</td><td>{d.kundum}</td>
                  </tr>
                ))}
                <tr className="totalrow">
                  <td>Total</td>{report.bySlot.map((s) => <td key={s.slot}>{s.attendances}</td>)}<td>{T.attendances}</td><td>{T.uniquePlayers}</td>
                  {report.bySlot.map((s) => <td key={s.slot}>{s.boxes}</td>)}<td>{T.boxes}</td><td>{T.kundum}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </Section>

        <Section title="Asistentes por invasión" hint="mapa de calor: más claro = más asistentes">
          <div className="grid-2">
            <div className="card">
              <Heatmap
                unit="Asistentes"
                columns={slots}
                rows={report.byDay.map((d) => ({
                  label: `${dayName(d.day)} ${fmtDay(d.day)}`,
                  values: slots.map((s) => d.bySlot[s].attendees),
                  extra: slots.map((s) => [{ label: 'Cajas', value: String(d.bySlot[s].boxes) }]),
                }))}
              />
            </div>
            <ChartCard title="Promedio de asistentes por día de la semana">
              <ColumnChart data={report.byWeekday.map((w) => ({ label: WEEKDAYS[w.weekday], value: w.avgAttendance, title: WEEKDAYS[w.weekday], rows: [{ label: 'Promedio de asistencias por día', value: n(w.avgAttendance) }, { label: 'Días en la temporada', value: String(w.days) }, { label: 'Cajas', value: n(w.boxes) }] }))} />
            </ChartCard>
          </div>
        </Section>

        <Section title="Jugadores">
          <div className="toolbar" style={{ marginBottom: 12 }}>
            <span className="muted">Asistencias, participación por horario y cajas asignadas en el reparto</span>
            <select className="select" value={sort} onChange={(e) => setSort(e.target.value)}>
              <option value="total">Ordenar por asistencias</option>
              <option value="boxes">Ordenar por cajas asignadas</option>
              <option value="name">Ordenar por nombre</option>
            </select>
          </div>
          <div className="card table-wrap">
            <table className="table">
              <thead><tr><th>Jugador</th><th>Asistencias</th><th>Participación</th>{slots.map((s) => <th key={s}>{s}</th>)}<th>Cajas asignadas</th><th>Entregado</th></tr></thead>
              <tbody>
                {players.map((p) => (
                  <tr key={p.id}>
                    <td><b>{p.name}</b></td>
                    <td>{p.total} / {report.opportunities}</td>
                    <td>
                      <div className="pct"><div className="pct__bar"><i style={{ width: `${Math.min(100, p.pct)}%` }} /></div>{p.pct}%</div>
                    </td>
                    {slots.map((s) => <td key={s}>{p.bySlot[s]}</td>)}
                    <td className="reward">{p.boxesShare}</td>
                    <td>{p.boxesShare > 0 ? (p.delivered ? '✓' : '—') : ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>

        <Section title="Comparativo de temporadas">
          <div className="card table-wrap">
            <table className="table">
              <thead><tr><th>Temporada</th><th>Fechas</th><th>Invasiones</th><th>Asistencias</th><th>Jugadores</th><th>Prom. asistentes</th><th>Cajas</th><th>Kundum</th><th>Cajas / asistencia</th></tr></thead>
              <tbody>
                {compare.map((s) => (
                  <tr key={s.id} className={s.id === selected ? 'is-first' : ''}>
                    <td><b>{s.name}</b></td><td>{fmtDay(s.start_date)} al {fmtDay(s.end_date)}</td><td>{s.invasionsHeld}</td><td>{n(s.attendances)}</td>
                    <td>{s.uniquePlayers}</td><td>{n(s.avgAttendance)}</td><td className="reward">{n(s.boxes)}</td><td>{n(s.kundum)}</td><td>{n(s.boxesPerAttendance)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>
      </div>
    </TipProvider>
  );
}
