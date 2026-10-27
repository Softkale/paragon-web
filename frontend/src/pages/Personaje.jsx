import React from 'react';
import { Link, useParams } from 'react-router-dom';
import CharacterSearch from '../components/CharacterSearch';
import Equipment from '../components/Equipment';
import GuildMark from '../components/GuildMark';
import useFetch from '../components/useFetch';

const fmt = (n) => Number(n || 0).toLocaleString('es');

// Ficha de un personaje con su equipamiento.
function CharacterView({ name }) {
  const { data, error, reload } = useFetch(`/ranking/character/${encodeURIComponent(name)}`);
  if (error) {
    return (
      <div className="card rk-state">
        <p>{error === 'Personaje no encontrado' ? `No se encontró ningún personaje llamado «${name}».` : error}</p>
        <button type="button" className="btn btn--sm btn--ghost" onClick={reload}>Reintentar</button>
      </div>
    );
  }
  if (!data) return <div className="card rk-state">Cargando personaje…</div>;

  const c = data.character;
  return (
    <>
      <div className="card clan">
        {c.guild && <GuildMark mark={c.guild.mark} size={7} />}
        <div className="clan__title">
          <h2>{c.name}{c.guild?.isMaster && <span className="rk-crown" title="Líder del clan"> ♛</span>}</h2>
          <p>
            {c.className}
            {c.guild && <> · <Link className="link" to={`/clanes/${encodeURIComponent(c.guild.name)}`}>{c.guild.name}</Link></>}
          </p>
        </div>
        {!c.hidden && (
          <dl className="clan__stats">
            <div><dt>Lvl</dt><dd>{fmt(c.level)}</dd></div>
            <div><dt>Reset</dt><dd>{fmt(c.resets)}</dd></div>
            <div><dt>GS</dt><dd>{fmt(c.gearScore)}</dd></div>
          </dl>
        )}
      </div>
      {c.hidden && <div className="card rk-state">Este jugador ocultó su perfil.</div>}
      {!c.hidden && !c.equipmentEnabled && <div className="card rk-state">El servidor no muestra el equipamiento de los personajes.</div>}
      {!c.hidden && c.equipmentEnabled && <Equipment items={c.equipment} />}
    </>
  );
}

export default function Personaje() {
  const { name } = useParams();
  return (
    <main className="section rk">
      <h1 className="section__title">Buscar <em>personaje</em></h1>
      <CharacterSearch key={name || ''} current={name || ''} />
      {name && <CharacterView key={name} name={name} />}
    </main>
  );
}
