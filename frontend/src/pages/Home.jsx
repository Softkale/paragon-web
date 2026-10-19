import React, { useEffect, useState } from 'react';
import Counter from '../components/Counter';
import Reveal from '../components/Reveal';
import { api } from '../api';
import { useSite } from '../SiteContext';

// La última palabra del título se resalta en color de fuego.
function Emphasized({ text }) {
  const i = text.lastIndexOf(' ');
  return i < 0 ? <em>{text}</em> : <>{text.slice(0, i)} <em>{text.slice(i + 1)}</em></>;
}

const fmtDate = (d) => new Date(d).toLocaleDateString('es', { day: '2-digit', month: 'short', year: 'numeric' });

export default function Home() {
  const site = useSite();
  const [events, setEvents] = useState([]);
  const [legends, setLegends] = useState([]);
  const [news, setNews] = useState([]);

  // Todo el contenido viene de la base de datos y se edita desde el panel.
  useEffect(() => {
    api.get('/events').then(setEvents).catch(() => {});
    api.get('/legends').then(setLegends).catch(() => {});
    api.get('/news').then(setNews).catch(() => {});
  }, []);

  return (
    <main>
      <section id="inicio" className="hero">
        <div className="hero__glow" />
        <img className="hero__logo" src="/img/paragon-logo.jpg" alt={`Escudo de ${site.hero_title}`} />
        <p className="hero__kicker">{site.hero_kicker}</p>
        <h1 className="hero__title">{site.hero_title}</h1>
        <p className="hero__sub">{site.hero_subtitle}</p>
        <div className="hero__cta">
          {site.cta_url && <a href="#unete" className="btn">{site.hero_primary}</a>}
          {events.length > 0 && <a href="#eventos" className="btn btn--ghost">{site.hero_secondary}</a>}
        </div>
        <a href="#stats" className="hero__scroll" aria-label="Bajar">⌄</a>
      </section>

      {site.stats.length > 0 && (
        <section id="stats" className="section">
          <div className="stats">
            {site.stats.map((s, i) => (
              <Reveal key={`${s.label}${i}`} delay={i * 100} className="stat">
                <strong><Counter value={s.value} suffix={s.suffix} /></strong>
                <span>{s.label}</span>
              </Reveal>
            ))}
          </div>
        </section>
      )}

      {events.length > 0 && (
        <section id="eventos" className="section">
          <Reveal><h2 className="section__title"><Emphasized text={site.events_title} /></h2></Reveal>
          <div className="grid grid--3">
            {events.map((e, i) => (
              <Reveal key={e.id} delay={i * 80}>
                <article className="card event">
                  <span className="event__icon">{e.icon || '⚔️'}</span>
                  <span className="tag">{e.tag}</span>
                  <h3>{e.name}</h3>
                  <p>{e.day} · <b>{e.time}</b></p>
                </article>
              </Reveal>
            ))}
          </div>
        </section>
      )}

      {legends.length > 0 && (
        <section id="ranking" className="section">
          <Reveal><h2 className="section__title"><Emphasized text={site.ranking_title} /></h2></Reveal>
          <Reveal>
            <div className="card table-wrap">
              <table className="table">
                <thead>
                  <tr><th>#</th><th>Jugador</th><th>Clase</th><th>Nivel</th><th>Puntos</th><th>Rol</th></tr>
                </thead>
                <tbody>
                  {legends.map((r, i) => (
                    <tr key={r.id} className={i === 0 ? 'is-first' : ''}>
                      <td><span className={`medal medal--${i + 1}`}>{i + 1}</span></td>
                      <td><b>{r.name}</b></td>
                      <td>{r.class_name}</td>
                      <td>{r.level}</td>
                      <td>{r.points.toLocaleString('es')}</td>
                      <td><span className="tag">{r.role}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Reveal>
        </section>
      )}

      {news.length > 0 && (
        <section id="noticias" className="section">
          <Reveal><h2 className="section__title"><Emphasized text={site.news_title} /></h2></Reveal>
          <div className="grid grid--3">
            {news.map((n, i) => (
              <Reveal key={n.id} delay={i * 100}>
                <article className="card news">
                  <time>{fmtDate(n.created_at)}</time>
                  <h3>{n.title}</h3>
                  <p>{n.body}</p>
                </article>
              </Reveal>
            ))}
          </div>
        </section>
      )}

      {site.cta_url && (
        <section id="unete" className="section section--cta">
          <Reveal>
            <div className="cta">
              <h2><Emphasized text={site.cta_title} /></h2>
              <p>{site.cta_text}</p>
              <a href={site.cta_url} className="btn" target="_blank" rel="noreferrer">{site.cta_button}</a>
            </div>
          </Reveal>
        </section>
      )}
    </main>
  );
}
