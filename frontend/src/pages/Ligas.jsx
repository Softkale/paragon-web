import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import useFetch from '../components/useFetch';

const fmt = (n) => Number(n || 0).toLocaleString('es');
const same = (a, b) => String(a || '').toLowerCase() === String(b || '').toLowerCase();
const dateTime = (iso) => new Date(iso).toLocaleString('es', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
const day = (iso) => new Date(iso).toLocaleDateString('es', { day: '2-digit', month: 'short', year: 'numeric' });

// Cuenta regresiva hasta el cierre de la liga; se actualiza cada segundo.
function Countdown({ to }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const left = Math.max(0, Math.floor((new Date(to).getTime() - now) / 1000));
  const parts = [
    [Math.floor(left / 86400), 'Días'],
    [Math.floor(left / 3600) % 24, 'Hs'],
    [Math.floor(left / 60) % 60, 'Min'],
    [left % 60, 'Seg'],
  ];
  return (
    <div className="lg-count" aria-label="Tiempo restante">
      {parts.map(([v, label]) => (
        <div key={label}><b>{String(v).padStart(2, '0')}</b><span>{label}</span></div>
      ))}
    </div>
  );
}

// Una fila del ranking; al abrirla muestra el aporte de cada integrante.
function Standing({ g, top, own }) {
  const [open, setOpen] = useState(false);
  const pct = top ? Math.round((g.points / top) * 100) : 0;
  const roster = [...g.roster].sort((a, b) => b.points - a.points || b.gearScore - a.gearScore);
  return (
    <li className={`lg-row ${own ? 'is-own' : ''}`}>
      <button type="button" className="lg-row__head" aria-expanded={open} onClick={() => setOpen(!open)}>
        <span className={`lg-pos lg-pos--${Math.min(g.rank, 4)}`}>#{g.rank}</span>
        <span className="lg-row__main">
          <b>{g.guild}</b>
          <i className="lg-bar"><i style={{ width: `${Math.max(pct, 2)}%` }} /></i>
        </span>
        <span className="lg-stat"><b className="lg-gold">{fmt(g.points)}</b><small>Puntos</small></span>
        <span className="lg-stat"><b>{fmt(g.kills)}</b><small>Kills</small></span>
        <span className="lg-chev" aria-hidden="true">{open ? '▴' : '▾'}</span>
      </button>
      {open && (
        <div className="lg-roster">
          <p className="lg-roster__meta">
            Líder <b>{g.master}</b> · {fmt(g.members)} integrantes · GS del clan {fmt(g.gearScore)}
            {' · '}<Link to={`/clanes/${encodeURIComponent(g.guild)}`}>Ver clan</Link>
          </p>
          <div className="table-wrap">
            <table className="table rk-table">
              <thead><tr><th>Personaje</th><th>Clase</th><th className="num">GS</th><th className="num">Puntos</th></tr></thead>
              <tbody>
                {roster.map((r) => (
                  <tr key={r.name} className={r.counts ? '' : 'lg-off'}>
                    <td><Link className="rk-guild" to={`/personaje/${encodeURIComponent(r.name)}`}>{r.name}</Link>{r.isMaster && <span className="rk-crown" title="Líder"> ♛</span>}</td>
                    <td>{r.className}</td>
                    <td className="num rk-gs">{fmt(r.gearScore)}</td>
                    <td className="num">{fmt(r.points)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </li>
  );
}

function Kills({ list }) {
  if (!list?.length) return null;
  return (
    <div className="lg-kills">
      <h4>Últimas muertes</h4>
      <ul>
        {list.map((k) => (
          <li key={`${k.at}-${k.character}-${k.monster}`} className={k.scored ? '' : 'lg-off'}>
            <span className="lg-kills__when">{dateTime(k.at)}</span>
            <span><b>{k.character}</b> <small>({k.guild})</small> mató a {k.monster}</span>
            <b className="lg-gold">{k.scored ? `+${fmt(k.points)}` : '—'}</b>
          </li>
        ))}
      </ul>
    </div>
  );
}

function League({ l, kills, ownGuild }) {
  const active = l.status === 'active';
  const top = Math.max(0, ...l.standings.map((g) => g.points));
  return (
    <article className={`card lg lg--${l.type}`}>
      <header className="lg__head">
        <div className="lg__tags">
          <span className="lg-tag lg-tag--type">Liga {l.type}</span>
          <span className={`lg-tag ${active ? 'lg-tag--on' : ''}`}>{active ? 'Liga en curso' : 'Finalizada'}</span>
        </div>
        <h2>{l.name}</h2>
        <p className="lg__period">{day(l.startsAt)} → {day(l.endsAt)}</p>
      </header>

      {active && (
        <div className="lg-clock">
          <p>Finaliza en <small>{dateTime(l.endsAt)}</small></p>
          <Countdown to={l.endsAt} />
        </div>
      )}

      <details className="lg-monsters">
        <summary>Puntos por monster ({l.monsters.length})</summary>
        <ul>
          {l.monsters.map((m) => <li key={m.name}><span>{m.name}</span><b className="lg-gold">{fmt(m.points)}</b></li>)}
        </ul>
      </details>

      {l.standings.length ? (
        <ol className="lg-list">
          {l.standings.map((g) => <Standing key={g.guild} g={g} top={top} own={same(g.guild, ownGuild)} />)}
        </ol>
      ) : <p className="rk-empty">Todavía no hay clanes en el ranking.</p>}

      {active && <Kills list={kills} />}
    </article>
  );
}

export default function Ligas() {
  const { data, error, reload } = useFetch('/ranking/leagues');
  const [tab, setTab] = useState('current');

  // El ranking se mueve con cada kill: se refresca solo cada minuto mientras se ve la liga en curso.
  useEffect(() => {
    if (tab !== 'current') return undefined;
    const t = setInterval(reload, 60_000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  const list = data ? (tab === 'current' ? data.current : data.history) : [];
  const seasons = tab === 'history'
    ? [...new Set(list.map((l) => l.name.toLowerCase()))].map((n) => list.filter((l) => l.name.toLowerCase() === n))
    : [list];

  return (
    <main className="section rk">
      <h1 className="section__title">Ligas de <em>clanes</em></h1>
      <p className="lg-intro">Guerra PvE entre clanes: cada monster que cae suma puntos a su clan durante la temporada.</p>
      <div className="tabs" role="tablist">
        <button type="button" role="tab" aria-selected={tab === 'current'} className={tab === 'current' ? 'is-on' : ''} onClick={() => setTab('current')}>En curso</button>
        <button type="button" role="tab" aria-selected={tab === 'history'} className={tab === 'history' ? 'is-on' : ''} onClick={() => setTab('history')}>Historial</button>
      </div>

      {!data && (
        <div className="card rk-state">
          <p>{error || 'Cargando…'}</p>
          {error && <button type="button" className="btn btn--sm btn--ghost" onClick={reload}>Reintentar</button>}
        </div>
      )}

      {data && !list.length && <div className="card rk-state"><p>{tab === 'current' ? 'No hay ligas en curso por ahora.' : 'Aún no hay temporadas anteriores.'}</p></div>}

      {data && seasons.map((group) => group.length > 0 && (
        <section key={group[0].id} className="lg-season">
          {tab === 'history' && <h3 className="lg-season__title">{group[0].name}</h3>}
          <div className="lg-grid">
            {[...group].sort((a, b) => a.type - b.type).map((l) => (
              <League key={l.id} l={l} kills={data.recentKills?.[l.type]} ownGuild={data.ownGuild} />
            ))}
          </div>
        </section>
      ))}
    </main>
  );
}
