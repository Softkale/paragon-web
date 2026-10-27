import React, { useState } from 'react';
import { Link, useHistory } from 'react-router-dom';
import useDebounced from './useDebounced';
import useFetch from './useFetch';

// Buscador de personajes por nick: sugiere coincidencias mientras se escribe y lleva a su ficha con el equipamiento.
export default function CharacterSearch({ current = '' }) {
  const history = useHistory();
  const [q, setQ] = useState(current);
  const term = useDebounced(q.trim(), 250);
  const searching = term.length >= 2 && term.toLowerCase() !== current.toLowerCase();
  const { data } = useFetch(searching ? `/ranking/gearscore?by=name&pageSize=8&q=${encodeURIComponent(term)}` : null);

  const submit = (e) => {
    e.preventDefault();
    if (q.trim()) history.push(`/personaje/${encodeURIComponent(q.trim())}`);
  };

  return (
    <div className="csearch">
      <form className="csearch__form" onSubmit={submit}>
        <input className="search" type="search" placeholder="Nick del personaje…" value={q} onChange={(e) => setQ(e.target.value)} maxLength={20} autoComplete="off" aria-label="Nick del personaje" />
        <button type="submit" className="btn btn--sm" disabled={!q.trim()}>Ver equipamiento</button>
      </form>
      {searching && data && (
        <ul className="csearch__list">
          {data.ranking.map((c) => (
            <li key={c.name}>
              <Link to={`/personaje/${encodeURIComponent(c.name)}`}>
                <b>{c.name}</b>
                <span>{c.className}</span>
                <span className="rk-dim">{c.guild || 'Sin guild'}</span>
                <span className="rk-gs">{c.gearScore.toLocaleString('es')} GS</span>
              </Link>
            </li>
          ))}
          {!data.ranking.length && <li className="csearch__none">Ningún personaje coincide. Si escribiste el nick completo, pulsa «Ver equipamiento».</li>}
        </ul>
      )}
    </div>
  );
}
