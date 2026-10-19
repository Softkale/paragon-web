import React, { useMemo, useState } from 'react';
import { api } from '../api';

const KUNDUM = 5; // las 5 primeras categorías son las cajas Kundum (+1 a +5)
const weekday = (d) => new Date(`${d}T12:00:00`).toLocaleDateString('es', { weekday: 'long' });
const fmtDay = (d) => new Date(`${d}T12:00:00`).toLocaleDateString('es', { day: '2-digit', month: '2-digit' });

// Carga del botín de cada invasión (día + horario): Kundum +1 a +5 y las demás categorías.
export default function LootEntry({ sheet, seasonId, day, onSaved }) {
  const [drafts, setDrafts] = useState({}); // `${day}|${slot}` -> arreglo de 8 textos
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');

  const attendeesOf = useMemo(() => {
    const map = {};
    sheet.checks.forEach((k) => {
      const [, d, s] = k.split('|');
      map[`${d}|${s}`] = (map[`${d}|${s}`] || 0) + 1;
    });
    return map;
  }, [sheet.checks]);

  const valuesFor = (key) => drafts[key] || (sheet.lootByInvasion[key] || Array(8).fill(0)).map((n) => (n ? String(n) : ''));
  const num = (v) => (v === '' ? 0 : Number(v));

  const setValue = (key, i, v) => {
    const cur = [...valuesFor(key)];
    cur[i] = v.replace(/[^0-9]/g, '').slice(0, 7);
    setDrafts({ ...drafts, [key]: cur });
  };

  const save = async (slot) => {
    const key = `${day}|${slot}`;
    setBusy(key);
    setError('');
    try {
      await api.put(`/seasons/${seasonId}/invasions/${day}/${encodeURIComponent(slot)}/loot`, { quantities: valuesFor(key).map(num) });
      setDrafts((d) => { const { [key]: _gone, ...rest } = d; return rest; });
      await onSaved();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy('');
    }
  };

  return (
    <div className="card">
      <p className="muted" style={{ marginBottom: 12 }}>
        Cajas obtenidas por la guild en cada invasión del <b>{weekday(day)} {fmtDay(day)}</b> (usa los días de arriba para cambiar).
      </p>
      {error && <p className="form-msg form-msg--error" style={{ marginBottom: 12 }}>{error}</p>}

      <div className="table-wrap">
        <table className="table loot-table">
          <thead>
            <tr>
              <th rowSpan="2">Horario</th>
              <th rowSpan="2">Asist.</th>
              <th colSpan={KUNDUM} className="loot-group">Cajas Kundum</th>
              <th colSpan={sheet.lootNames.length - KUNDUM} className="loot-group">Otros</th>
              <th rowSpan="2">Total</th>
              <th rowSpan="2" />
            </tr>
            <tr>
              {sheet.lootNames.map((n, i) => <th key={n} className="att-slot">{i < KUNDUM ? n.replace('Cajas ', '') : n}</th>)}
            </tr>
          </thead>
          <tbody>
            {sheet.slots.map((slot) => {
              const key = `${day}|${slot}`;
              const vals = valuesFor(key);
              const total = vals.reduce((a, v) => a + num(v), 0);
              return (
                <tr key={slot}>
                  <td><b>{slot}</b></td>
                  <td>{attendeesOf[key] || 0}</td>
                  {vals.map((v, i) => (
                    <td key={i} className="loot-cell">
                      <input
                        className="num-input"
                        inputMode="numeric"
                        value={v}
                        placeholder="0"
                        aria-label={`${sheet.lootNames[i]} ${slot}`}
                        onChange={(e) => setValue(key, i, e.target.value)}
                      />
                    </td>
                  ))}
                  <td className="reward">{total}</td>
                  <td>
                    <button className={`btn btn--sm ${drafts[key] ? '' : 'btn--ghost'}`} disabled={!drafts[key] || busy === key} onClick={() => save(slot)}>
                      {busy === key ? '…' : drafts[key] ? 'Guardar' : 'Guardado'}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
