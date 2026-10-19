import React, { useEffect, useState } from 'react';
import { Redirect } from 'react-router-dom';
import Embers from '../components/Embers';
import MemberBar from '../components/MemberBar';
import { ColumnChart, HBarChart, Heatmap, StatTile, TipProvider } from '../components/charts';
import { api } from '../api';
import { useAuth } from '../AuthContext';

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

// Reporte de cajas obtenidas por la guild. Lo ve cualquier usuario con sesión; no incluye asistencias.
export default function LootReport() {
  const { user, loading: authLoading } = useAuth();
  const [seasons, setSeasons] = useState(null);
  const [selected, setSelected] = useState(null);
  const [report, setReport] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const ready = !!user && !user.mustChange;

  useEffect(() => {
    if (!ready) return;
    api.get('/loot-reports/seasons')
      .then((list) => {
        setSeasons(list);
        const today = new Date().toISOString().slice(0, 10);
        const current = list.find((s) => s.start_date <= today && today <= s.end_date) || list[0];
        setSelected(current ? current.id : null);
      })
      .catch((e) => setError(e.message));
  }, [ready]);

  useEffect(() => {
    if (!selected) return;
    setBusy(true);
    api.get(`/loot-reports/season/${selected}`)
      .then((r) => { setReport(r); setError(''); })
      .catch((e) => setError(e.message))
      .finally(() => setBusy(false));
  }, [selected]);

  if (authLoading) return null;
  if (!user) return <Redirect to="/login" />;
  if (user.mustChange) return <Redirect to="/cambiar-clave" />;

  let body;
  if (error && !report) body = <div className="card empty">{error}</div>;
  else if (!seasons) body = <div className="card empty">Cargando…</div>;
  else if (!seasons.length) body = <div className="card empty">Todavía no hay temporadas registradas.</div>;
  else if (!report) body = <div className="card empty">Cargando reporte…</div>;
  else if (!report.totals.boxes) body = <div className="card empty">Aún no se han registrado cajas en esta temporada.</div>;
  else {
    const { totals: T, slots, lootNames, kundumCount } = report;
    const bestInvasion = maxBy(report.byInvasion, 'boxes');
    const bestDay = maxBy(report.byDay, 'boxes');
    const bestSlot = maxBy(report.bySlot, 'avgBoxes');
    const bestWeekday = maxBy(report.byWeekday.filter((w) => w.days), 'avgBoxes');
    const topCategory = T.byCategory.reduce((b, q, i) => (q > T.byCategory[b] ? i : b), 0);

    body = (
      <TipProvider>
        <div className={busy ? 'is-loading' : ''}>
          <div className="stat-row">
            <StatTile hero label="Total de cajas de la temporada" value={n(T.boxes)} sub={`${n(T.avgBoxesPerInvasion)} por invasión con botín`} />
            <StatTile label={`Cajas Kundum (+1 a +${kundumCount})`} value={n(T.kundum)} sub={`${Math.round((T.kundum / T.boxes) * 100)}% del total`} />
            <StatTile label="Invasiones con botín" value={n(T.invasionsWithLoot)} sub={`de ${report.byDay.length * slots.length} posibles`} />
            <StatTile label="Otras cajas" value={n(T.boxes - T.kundum)} sub="Ancient, Legendary y Fenrir" />
          </div>

          <Section title="Destacados">
            <ul className="card highlights">
              {bestInvasion && <li>Invasión con más cajas: <b>{dayName(bestInvasion.day)} {fmtDay(bestInvasion.day)} {bestInvasion.slot}</b> ({n(bestInvasion.boxes)} cajas, {n(bestInvasion.kundum)} Kundum).</li>}
              {bestDay && bestDay.boxes > 0 && <li>Día con más cajas: <b>{dayName(bestDay.day)} {fmtDay(bestDay.day)}</b> ({n(bestDay.boxes)}).</li>}
              {bestSlot && bestSlot.avgBoxes > 0 && <li>Horario que más cajas da en promedio: <b>{bestSlot.slot}</b> ({n(bestSlot.avgBoxes)} por invasión).</li>}
              {bestWeekday && bestWeekday.avgBoxes > 0 && <li>Mejor día de la semana en promedio: <b>{WEEKDAYS[bestWeekday.weekday]}</b> ({n(bestWeekday.avgBoxes)} cajas por día).</li>}
              <li>Categoría más obtenida: <b>{lootNames[topCategory]}</b> ({n(T.byCategory[topCategory])}).</li>
            </ul>
          </Section>

          <Section title="Cajas por categoría" hint="Kundum +1 a +5 y otras">
            <div className="grid-2">
              <ChartCard title="Total por categoría">
                <HBarChart data={lootNames.map((name, i) => ({ label: name, value: T.byCategory[i], title: name, rows: [{ label: 'Cajas', value: n(T.byCategory[i]) }, { label: 'Del total', value: `${Math.round((T.byCategory[i] / T.boxes) * 100)}%` }] }))} />
              </ChartCard>
              <div className="card table-wrap">
                <table className="table">
                  <thead><tr><th>Categoría</th><th>Cajas</th><th>%</th></tr></thead>
                  <tbody>
                    {lootNames.map((name, i) => (
                      <tr key={name} className={i === kundumCount - 1 ? 'row-sep' : ''}>
                        <td>{name}</td><td className="reward">{n(T.byCategory[i])}</td><td>{Math.round((T.byCategory[i] / T.boxes) * 100)}%</td>
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
              <ChartCard title="Cajas por horario">
                <ColumnChart data={report.bySlot.map((s) => ({ label: s.slot, value: s.boxes, title: `Invasión de las ${s.slot}`, rows: [{ label: 'Cajas', value: n(s.boxes) }, { label: 'Kundum', value: n(s.kundum) }] }))} />
              </ChartCard>
              <ChartCard title="Promedio de cajas por invasión">
                <ColumnChart data={report.bySlot.map((s) => ({ label: s.slot, value: s.avgBoxes, title: `Invasión de las ${s.slot}`, rows: [{ label: 'Promedio de cajas', value: n(s.avgBoxes) }, { label: 'Invasiones con botín', value: String(s.invasions) }] }))} />
              </ChartCard>
            </div>
            <div className="card table-wrap" style={{ marginTop: 18 }}>
              <table className="table">
                <thead><tr><th>Horario</th><th>Invasiones</th><th>Cajas</th><th>Kundum</th><th>Prom. cajas</th>{Array.from({ length: kundumCount }, (_, i) => <th key={i}>{lootNames[i]}</th>)}<th>Otras</th></tr></thead>
                <tbody>
                  {report.bySlot.map((s) => (
                    <tr key={s.slot}>
                      <td><b>{s.slot}</b></td><td>{s.invasions}</td><td className="reward">{n(s.boxes)}</td><td>{n(s.kundum)}</td><td>{n(s.avgBoxes)}</td>
                      {s.byCategory.slice(0, kundumCount).map((q, i) => <td key={i}>{q}</td>)}
                      <td>{s.boxes - s.kundum}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Section>

          <Section title="Por día">
            <div className="grid-2">
              <ChartCard title="Cajas por día">
                <ColumnChart data={report.byDay.map((d) => ({ label: fmtDay(d.day), value: d.boxes, title: `${dayName(d.day)} ${fmtDay(d.day)}`, rows: [{ label: 'Cajas', value: n(d.boxes) }, { label: 'Kundum', value: n(d.kundum) }] }))} />
              </ChartCard>
              <ChartCard title="Promedio de cajas por día de la semana">
                <ColumnChart data={report.byWeekday.map((w) => ({ label: WEEKDAYS[w.weekday], value: w.avgBoxes, title: WEEKDAYS[w.weekday], rows: [{ label: 'Promedio de cajas por día', value: n(w.avgBoxes) }, { label: 'Días en la temporada', value: String(w.days) }, { label: 'Cajas', value: n(w.boxes) }] }))} />
              </ChartCard>
            </div>
            <div className="card table-wrap" style={{ marginTop: 18 }}>
              <table className="table">
                <thead><tr><th>Día</th>{slots.map((s) => <th key={s}>{s}</th>)}<th>Cajas</th><th>Kundum</th></tr></thead>
                <tbody>
                  {report.byDay.map((d) => (
                    <tr key={d.day}>
                      <td><b>{dayName(d.day)} {fmtDay(d.day)}</b></td>
                      {slots.map((s) => <td key={s}>{d.bySlot[s] || 0}</td>)}
                      <td className="reward">{d.boxes}</td><td>{d.kundum}</td>
                    </tr>
                  ))}
                  <tr className="totalrow">
                    <td>Total</td>{report.bySlot.map((s) => <td key={s.slot}>{s.boxes}</td>)}<td>{T.boxes}</td><td>{T.kundum}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </Section>

          <Section title="Cajas por invasión" hint="mapa de calor: más claro = más cajas">
            <div className="card">
              <Heatmap
                unit="Cajas"
                columns={slots}
                rows={report.byDay.map((d) => ({ label: `${dayName(d.day)} ${fmtDay(d.day)}`, values: slots.map((s) => d.bySlot[s] || 0) }))}
              />
            </div>
          </Section>

          <Section title="Detalle por invasión" hint="solo invasiones con botín registrado">
            <div className="card table-wrap">
              <table className="table">
                <thead><tr><th>Día</th><th>Horario</th>{lootNames.map((name) => <th key={name}>{name}</th>)}<th>Total</th></tr></thead>
                <tbody>
                  {report.byInvasion.map((i) => (
                    <tr key={`${i.day}${i.slot}`}>
                      <td><b>{dayName(i.day)} {fmtDay(i.day)}</b></td><td>{i.slot}</td>
                      {i.byCategory.map((q, c) => <td key={c}>{q || '·'}</td>)}
                      <td className="reward">{i.boxes}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Section>

          <Section title="Comparativo de temporadas">
            <div className="card table-wrap">
              <table className="table">
                <thead><tr><th>Temporada</th><th>Fechas</th><th>Invasiones con botín</th><th>Cajas</th><th>Kundum</th><th>Prom. por invasión</th></tr></thead>
                <tbody>
                  {seasons.map((s) => (
                    <tr key={s.id} className={s.id === selected ? 'is-first' : ''}>
                      <td><b>{s.name}</b></td><td>{fmtDay(s.start_date)} al {fmtDay(s.end_date)}</td><td>{s.invasionsWithLoot}</td>
                      <td className="reward">{n(s.boxes)}</td><td>{n(s.kundum)}</td><td>{n(s.avgBoxesPerInvasion)}</td>
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

  return (
    <main className="checkin">
      <Embers count={20} />
      <MemberBar />
      <section className="cajas__body">
        <h1>Cajas obtenidas</h1>
        <p className="cajas__sub">Botín de la guild en las invasiones. Visible para todos los miembros.</p>
        {seasons && seasons.length > 0 && (
          <div className="toolbar">
            <div className="season-pick">
              <select className="select" value={selected || ''} onChange={(e) => setSelected(Number(e.target.value))}>
                {seasons.map((s) => <option key={s.id} value={s.id}>{s.name} · {fmtDay(s.start_date)} al {fmtDay(s.end_date)}</option>)}
              </select>
              {report && <span className="tag">{report.season.weeks} {report.season.weeks === 1 ? 'semana' : 'semanas'}</span>}
            </div>
          </div>
        )}
        {body}
      </section>
    </main>
  );
}
