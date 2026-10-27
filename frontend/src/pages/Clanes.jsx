import React, { useEffect, useMemo, useState } from 'react';
import { Link, useHistory, useLocation } from 'react-router-dom';
import GuildRoster from '../components/GuildRoster';
import MembersTable from '../components/MembersTable';
import CharacterSearch from '../components/CharacterSearch';
import useDebounced from '../components/useDebounced';
import useFetch from '../components/useFetch';

const TABS = [
  ['paragon', 'Nuestro clan'],
  ['clanes', 'Todos los clanes'],
  ['nivel', 'Nivel'],
  ['gs', 'Gear Score'],
  ['personaje', 'Buscar personaje'],
];

const fmt = (n) => Number(n || 0).toLocaleString('es');
const same = (a, b) => String(a || '').toLowerCase() === String(b || '').toLowerCase();

function State({ error, reload }) {
  return (
    <div className="card rk-state">
      <p>{error || 'Cargando…'}</p>
      {error && <button type="button" className="btn btn--sm btn--ghost" onClick={reload}>Reintentar</button>}
    </div>
  );
}

function SearchBox({ value, onChange, placeholder }) {
  return (
    <div className="rk-tools">
      <input className="search" type="search" placeholder={placeholder} value={value} onChange={(e) => onChange(e.target.value)} aria-label={placeholder} />
    </div>
  );
}

// Lista de todos los clanes del servidor; cada fila lleva a su detalle.
function GuildsTab() {
  const { data, error, reload } = useFetch('/ranking/guilds');
  const [q, setQ] = useState('');
  const rows = useMemo(() => {
    const term = q.trim().toLowerCase();
    return (data?.guilds || []).filter((g) => !term || g.name.toLowerCase().includes(term) || g.master.toLowerCase().includes(term));
  }, [data, q]);

  if (!data) return <State error={error} reload={reload} />;
  return (
    <>
      <SearchBox value={q} onChange={setQ} placeholder="Buscar clan o líder…" />
      <div className="card table-wrap">
        <table className="table rk-table">
          <thead>
            <tr><th>#</th><th>Clan</th><th>Líder</th><th className="num">Integrantes</th><th className="num">GS promedio</th><th className="num">GS total</th></tr>
          </thead>
          <tbody>
            {rows.map((g, i) => (
              <tr key={g.name} className={same(g.name, data.ownGuild) ? 'is-own' : ''}>
                <td className="rk-rank">{i + 1}</td>
                <td><Link className="rk-guild" to={`/clanes/${encodeURIComponent(g.name)}`}><b>{g.name}</b></Link></td>
                <td>{g.master}</td>
                <td className="num">{fmt(g.members)}</td>
                <td className="num rk-gs">{fmt(g.avgGearScore)}</td>
                <td className="num">{fmt(g.totalGearScore)}</td>
              </tr>
            ))}
            {!rows.length && <tr><td colSpan={6} className="rk-empty">Ningún clan coincide</td></tr>}
          </tbody>
        </table>
      </div>
    </>
  );
}

// Top 100 por nivel: es el único listado que trae nivel, master level, resets y GS juntos.
function LevelTab() {
  const { data, error, reload } = useFetch('/ranking/level');
  const [q, setQ] = useState('');
  const rows = useMemo(() => {
    const term = q.trim().toLowerCase();
    return (data?.ranking || []).filter((r) => !term || r.name.toLowerCase().includes(term) || r.guild.toLowerCase().includes(term));
  }, [data, q]);

  if (!data) return <State error={error} reload={reload} />;
  return (
    <>
      <SearchBox value={q} onChange={setQ} placeholder="Buscar nick o clan…" />
      <MembersTable rows={rows} ownGuild={data.ownGuild} sortable empty="Ningún personaje coincide" />
    </>
  );
}

// Todos los personajes ordenados por GS, con búsqueda y paginación en el servidor (son más de 25 mil).
function GearTab() {
  const [q, setQ] = useState('');
  const term = useDebounced(q.trim(), 300);
  const [page, setPage] = useState(1);
  useEffect(() => setPage(1), [term]);

  const { data, error, loading, reload } = useFetch(`/ranking/gearscore?page=${page}&pageSize=50&q=${encodeURIComponent(term)}`);
  if (!data) return <State error={error} reload={reload} />;
  return (
    <>
      <SearchBox value={q} onChange={setQ} placeholder="Buscar nick o clan…" />
      <MembersTable rows={data.ranking} ownGuild={data.ownGuild} columns={['rank', 'name', 'class', 'gs', 'guild']} empty="Ningún personaje coincide" />
      <div className="rk-pager">
        <button type="button" className="btn btn--sm btn--ghost" disabled={page <= 1 || loading} onClick={() => setPage(page - 1)}>← Anterior</button>
        <span>Página {data.page} de {fmt(data.totalPages)} · {fmt(data.total)} personajes</span>
        <button type="button" className="btn btn--sm btn--ghost" disabled={page >= data.totalPages || loading} onClick={() => setPage(page + 1)}>Siguiente →</button>
      </div>
    </>
  );
}

export default function Clanes() {
  const history = useHistory();
  const { search } = useLocation();
  const asked = new URLSearchParams(search).get('tab');
  const tab = TABS.some(([k]) => k === asked) ? asked : 'paragon';

  return (
    <main className="section rk">
      <h1 className="section__title">Clanes y <em>rankings</em></h1>
      <div className="tabs" role="tablist">
        {TABS.map(([key, label]) => (
          <button key={key} type="button" role="tab" aria-selected={tab === key} className={tab === key ? 'is-on' : ''} onClick={() => history.push({ search: `?tab=${key}` })}>
            {label}
          </button>
        ))}
      </div>
      {tab === 'paragon' && <GuildRoster path="/ranking/own-guild" />}
      {tab === 'clanes' && <GuildsTab />}
      {tab === 'nivel' && <LevelTab />}
      {tab === 'gs' && <GearTab />}
      {tab === 'personaje' && <CharacterSearch />}
    </main>
  );
}
