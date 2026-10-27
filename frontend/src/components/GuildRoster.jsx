import React, { useMemo, useState } from 'react';
import GuildMark from './GuildMark';
import MembersTable from './MembersTable';
import useFetch from './useFetch';

const fmt = (n) => Number(n || 0).toLocaleString('es');

// Ficha de un clan (escudo, líder, cifras) y la tabla de sus integrantes. `path` es la ruta de la API del clan.
export default function GuildRoster({ path }) {
  const { data, error, loading, reload } = useFetch(path);
  const [q, setQ] = useState('');

  const members = useMemo(() => {
    const term = q.trim().toLowerCase();
    return (data?.members || []).filter((m) => !term || m.name.toLowerCase().includes(term));
  }, [data, q]);

  if (error) {
    return (
      <div className="card rk-state">
        <p>{error}</p>
        <button type="button" className="btn btn--sm btn--ghost" onClick={reload}>Reintentar</button>
      </div>
    );
  }
  if (!data) return <div className="card rk-state">Cargando clan… la primera consulta puede tardar unos segundos.</div>;

  const { guild } = data;
  return (
    <>
      <div className="card clan">
        <GuildMark mark={guild.mark} size={7} />
        <div className="clan__title">
          <h2>{guild.name}</h2>
          <p>Líder: <b>{guild.master}</b></p>
        </div>
        <dl className="clan__stats">
          <div><dt>Integrantes</dt><dd>{fmt(guild.members)}</dd></div>
          <div><dt>GS promedio</dt><dd>{fmt(guild.avgGearScore)}</dd></div>
          <div><dt>GS total</dt><dd>{fmt(guild.totalGearScore)}</dd></div>
        </dl>
      </div>

      <div className="rk-tools">
        <input className="search" type="search" placeholder="Buscar integrante…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Buscar integrante" />
        {loading && <span className="rk-dim">Actualizando…</span>}
      </div>

      <MembersTable rows={members} ownGuild={data.ownGuild} sortable empty="Ningún integrante coincide" />
      {data.members.some((m) => m.masterLevel === null) && (
        <p className="rk-note">— : el servidor solo publica el Master Level de los 100 primeros del ranking de nivel, y no muestra nivel ni resets de los perfiles ocultos.</p>
      )}
    </>
  );
}
