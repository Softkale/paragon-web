import React from 'react';
import { Link, useParams } from 'react-router-dom';
import GuildRoster from '../components/GuildRoster';

// Detalle de cualquier clan del servidor: /clanes/:name
export default function ClanDetail() {
  const { name } = useParams();
  return (
    <main className="section rk">
      <p className="rk-back"><Link className="link" to="/clanes?tab=clanes">← Todos los clanes</Link></p>
      <GuildRoster key={name} path={`/ranking/guilds/${encodeURIComponent(name)}`} />
    </main>
  );
}
