import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import GuildMark from './GuildMark';

// Tabla de personajes: nick, clase, nivel, master level, GS, resets y clan. `columns` elige cuáles mostrar.
const COLS = {
  rank: { label: '#' },
  name: { label: 'Nick', sort: 'name' },
  class: { label: 'Clase', sort: 'className' },
  level: { label: 'Lvl', sort: 'level', num: true },
  master: { label: 'Master Lvl', sort: 'masterLevel', num: true },
  gs: { label: 'GS', sort: 'gearScore', num: true },
  resets: { label: 'Reset', sort: 'resets', num: true },
  guild: { label: 'Guild', sort: 'guild' },
};
const ALL = Object.keys(COLS);

const isEmpty = (v) => v === null || v === undefined || v === '';
const fmt = (v) => (isEmpty(v) ? <span className="rk-dim">—</span> : Number(v).toLocaleString('es'));
const same = (a, b) => String(a || '').toLowerCase() === String(b || '').toLowerCase();

// Los vacíos van siempre al final, sea cual sea el sentido.
function sortRows(rows, sort) {
  if (!sort) return rows;
  const { key, dir } = sort;
  return [...rows].sort((a, b) => {
    const x = a[key];
    const y = b[key];
    if (isEmpty(x) || isEmpty(y)) return isEmpty(x) - isEmpty(y);
    return dir * (typeof x === 'string' ? x.localeCompare(y) : x - y);
  });
}

function Cell({ col, row, index }) {
  switch (col) {
    case 'rank': {
      const r = row.rank ?? index + 1;
      return <td className="rk-rank">{row.rank && r <= 3 ? <span className={`medal medal--${r}`}>{r}</span> : r}</td>;
    }
    case 'name':
      return <td><Link className="rk-nick" to={`/personaje/${encodeURIComponent(row.name)}`}><b>{row.name}</b></Link>{row.isMaster && <span className="rk-crown" title="Líder del clan"> ♛</span>}</td>;
    case 'class':
      return <td>{row.className}</td>;
    case 'level':
      return <td className="num">{fmt(row.level)}</td>;
    case 'master':
      return <td className="num">{fmt(row.masterLevel)}</td>;
    case 'gs':
      return <td className="num rk-gs">{fmt(row.gearScore)}</td>;
    case 'resets':
      return <td className="num">{fmt(row.resets)}</td>;
    case 'guild':
      return row.guild ? (
        <td>
          <Link className="rk-guild" to={`/clanes/${encodeURIComponent(row.guild)}`}>
            {row.guildMark && <GuildMark mark={row.guildMark} size={2} />}
            {row.guild}
          </Link>
        </td>
      ) : <td><span className="rk-dim">—</span></td>;
    default:
      return <td />;
  }
}

export default function MembersTable({ rows, ownGuild, columns = ALL, sortable = false, empty = 'Sin resultados' }) {
  const [sort, setSort] = useState(null);
  const view = useMemo(() => sortRows(rows, sort), [rows, sort]);

  // Primer clic: mayor a menor en números y A-Z en texto; segundo clic invierte.
  const toggle = (key, isNum) => setSort((s) => (s && s.key === key ? { key, dir: -s.dir } : { key, dir: isNum ? -1 : 1 }));

  return (
    <div className="card table-wrap">
      <table className="table rk-table">
        <thead>
          <tr>
            {columns.map((c) => {
              const { label, sort: key, num } = COLS[c];
              const on = sort && sort.key === key;
              return (
                <th key={c} className={num ? 'num' : ''} aria-sort={on ? (sort.dir > 0 ? 'ascending' : 'descending') : undefined}>
                  {sortable && key ? (
                    <button type="button" className={`rk-sort ${on ? 'is-on' : ''}`} onClick={() => toggle(key, num)}>
                      {label}<span aria-hidden="true">{on ? (sort.dir > 0 ? ' ▲' : ' ▼') : ''}</span>
                    </button>
                  ) : label}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {view.map((row, i) => (
            <tr key={row.name} className={ownGuild && same(row.guild, ownGuild) ? 'is-own' : ''}>
              {columns.map((c) => <Cell key={c} col={c} row={row} index={i} />)}
            </tr>
          ))}
          {!view.length && <tr><td colSpan={columns.length} className="rk-empty">{empty}</td></tr>}
        </tbody>
      </table>
    </div>
  );
}
