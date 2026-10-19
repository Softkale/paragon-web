import React, { useEffect, useState } from 'react';
import { api } from '../api';
import ContentManager from '../components/ContentManager';

const fmtDate = (d) => new Date(d).toLocaleDateString('es');

const TABS = [
  { id: 'site', label: 'Textos y cifras' },
  { id: 'events', label: 'Eventos' },
  { id: 'news', label: 'Noticias' },
  { id: 'legends', label: 'Salón de leyendas' },
];

// Campos de texto de la portada, agrupados como se ven en la web.
const GROUPS = [
  { title: 'Portada', fields: [
    ['hero_kicker', 'Texto pequeño sobre el título', 60],
    ['hero_title', 'Título principal', 30],
    ['hero_subtitle', 'Frase debajo del título', 140],
    ['hero_primary', 'Botón principal', 30],
    ['hero_secondary', 'Botón secundario', 30],
  ] },
  { title: 'Títulos de secciones', fields: [
    ['events_title', 'Eventos e invasiones', 60],
    ['ranking_title', 'Salón de leyendas', 60],
    ['news_title', 'Noticias', 60],
  ] },
  { title: 'Llamada final y pie de página', fields: [
    ['cta_title', 'Título de la llamada final', 80],
    ['cta_text', 'Texto de la llamada final', 200],
    ['cta_button', 'Botón de la llamada final', 30],
    ['footer_text', 'Texto del pie de página (después de © año PARAGON)', 120],
  ] },
];

function SiteTextEditor() {
  const [form, setForm] = useState(null);
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => { api.get('/site').then(setForm).catch((e) => setMsg({ ok: false, text: e.message })); }, []);

  if (!form) return <div className="card empty">{msg ? msg.text : 'Cargando…'}</div>;

  const setField = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  const setStat = (i, k, v) => setForm({ ...form, stats: form.stats.map((s, j) => (j === i ? { ...s, [k]: v } : s)) });

  const save = async (e) => {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    try {
      const payload = { ...form, stats: form.stats.map((s) => ({ ...s, value: Number(s.value) })) };
      setForm(await api.put('/site', payload));
      setMsg({ ok: true, text: 'Cambios guardados. Ya se ven en la portada.' });
    } catch (err) {
      setMsg({ ok: false, text: err.message });
    } finally {
      setBusy(false);
    }
  };

  const restore = async () => {
    if (!window.confirm('¿Volver a los textos originales? Se quitarán también las cifras.')) return;
    try {
      setForm(await api.del('/site'));
      setMsg({ ok: true, text: 'Textos originales restaurados.' });
    } catch (err) {
      setMsg({ ok: false, text: err.message });
    }
  };

  return (
    <form onSubmit={save}>
      <p className="muted" style={{ marginBottom: 14 }}>
        Edita lo que se ve en la portada pública. En los títulos, la <b>última palabra</b> se resalta en color de fuego.
      </p>
      <div className="card form-grid" style={{ marginBottom: 18 }}>
        <h4 className="field--wide cm-title">Botón de contacto (cómo se une la gente)</h4>
        <label className="field field--wide">
          <span>Enlace (Discord, WhatsApp, correo…)</span>
          <input value={form.cta_url || ''} maxLength={300} onChange={setField('cta_url')} placeholder="https://discord.gg/tu-invitacion" />
        </label>
        <p className="muted field--wide" style={{ margin: 0 }}>
          Ya no hay registro público: las cuentas las crean los oficiales. Aquí pones a dónde lleva el botón «{form.cta_button}» de la portada.
          <b> Si lo dejas vacío, el botón y la sección «{form.cta_title}» no se muestran.</b>
        </p>
      </div>
      {GROUPS.map((g) => (
        <div key={g.title} className="card form-grid" style={{ marginBottom: 18 }}>
          <h4 className="field--wide cm-title">{g.title}</h4>
          {g.fields.map(([key, label, max]) => (
            <label key={key} className={`field ${max > 60 ? 'field--wide' : ''}`}>
              <span>{label}</span>
              <input value={form[key]} maxLength={max} onChange={setField(key)} required />
            </label>
          ))}
        </div>
      ))}

      <div className="card" style={{ marginBottom: 18 }}>
        <h4 className="cm-title">Cifras de la portada</h4>
        <p className="muted" style={{ margin: '6px 0 14px' }}>
          Números destacados (ej. Miembros 128+). Si no agregas ninguna, esa franja no se muestra. Máximo 6.
        </p>
        <div className="stat-edit">
          {form.stats.map((s, i) => (
            <div key={i} className="stat-edit__row">
              <input placeholder="Nombre (ej. Miembros)" maxLength={30} value={s.label} onChange={(e) => setStat(i, 'label', e.target.value)} required />
              <input type="number" min="0" step="1" placeholder="Valor" value={s.value} onChange={(e) => setStat(i, 'value', e.target.value)} required />
              <input placeholder="+" maxLength={3} value={s.suffix} onChange={(e) => setStat(i, 'suffix', e.target.value)} />
              <button type="button" className="icon-btn" title="Quitar" onClick={() => setForm({ ...form, stats: form.stats.filter((_, j) => j !== i) })}>🗑️</button>
            </div>
          ))}
        </div>
        {form.stats.length < 6 && (
          <button type="button" className="icon-btn" style={{ marginTop: 12 }} onClick={() => setForm({ ...form, stats: [...form.stats, { label: '', value: '', suffix: '' }] })}>+ Agregar cifra</button>
        )}
      </div>

      {msg && <p className={`form-msg ${msg.ok ? 'form-msg--ok' : 'form-msg--error'}`} style={{ marginBottom: 14 }}>{msg.text}</p>}
      <div className="form-actions">
        <button className="btn btn--sm" type="submit" disabled={busy}>{busy ? 'Guardando…' : 'Guardar cambios'}</button>
        <a className="icon-btn" href="/" target="_blank" rel="noreferrer">Ver portada ↗</a>
        <button type="button" className="icon-btn" onClick={restore}>Restaurar originales</button>
      </div>
    </form>
  );
}

const eventFields = [
  { key: 'name', label: 'Nombre', placeholder: 'Castle Siege' },
  { key: 'tag', label: 'Tipo', placeholder: 'Invasión, Guerra, Evento…' },
  { key: 'day', label: 'Día', placeholder: 'Sábado' },
  { key: 'time', label: 'Hora', placeholder: '21:30' },
  { key: 'icon', label: 'Icono (emoji)', optional: true, placeholder: '🏰' },
];
const newsFields = [
  { key: 'title', label: 'Título', wide: true },
  { key: 'body', label: 'Texto', wide: true, area: true },
];
const legendFields = [
  { key: 'name', label: 'Jugador' },
  { key: 'class_name', label: 'Clase', placeholder: 'Soul Master' },
  { key: 'level', label: 'Nivel', number: true },
  { key: 'points', label: 'Puntos', number: true },
  { key: 'role', label: 'Rol', placeholder: 'Guild Master, Oficial, Miembro' },
];

export default function ContentAdmin() {
  const [tab, setTab] = useState('site');

  return (
    <>
      <div className="tabs">
        {TABS.map((t) => <button key={t.id} className={tab === t.id ? 'is-on' : ''} onClick={() => setTab(t.id)}>{t.label}</button>)}
      </div>

      {tab === 'site' && <SiteTextEditor />}

      {tab === 'events' && (
        <ContentManager
          key="events"
          path="/events"
          hint="Los eventos que se ven en la portada (Castle Siege, Blood Castle, etc.). Pasa el cursor sobre una tarjeta para editarla o eliminarla."
          fields={eventFields}
          empty={{ name: '', tag: '', day: '', time: '', icon: '' }}
          render={(e) => (
            <article className="card event">
              <span className="event__icon">{e.icon || '⚔️'}</span>
              <span className="tag">{e.tag}</span>
              <h3>{e.name}</h3>
              <p>{e.day} · <b>{e.time}</b></p>
            </article>
          )}
        />
      )}

      {tab === 'news' && (
        <ContentManager
          key="news"
          path="/news"
          hint="Las noticias más recientes aparecen primero en la portada."
          fields={newsFields}
          empty={{ title: '', body: '' }}
          render={(n) => (
            <article className="card news">
              <time>{fmtDate(n.created_at)}</time>
              <h3>{n.title}</h3>
              <p>{n.body}</p>
            </article>
          )}
        />
      )}

      {tab === 'legends' && (
        <ContentManager
          key="legends"
          path="/legends"
          hint="Ranking que se muestra en la portada, cargado a mano. Se ordena solo por puntos (mayor primero); los 3 primeros llevan medalla."
          fields={legendFields}
          empty={{ name: '', class_name: '', level: '', points: '', role: '' }}
          render={(l) => (
            <article className="card legend-card">
              <h3>{l.name}</h3>
              <p>{l.class_name} · Nivel {l.level}</p>
              <p className="legend-card__points">{l.points.toLocaleString('es')} <small>puntos</small></p>
              <span className="tag">{l.role}</span>
            </article>
          )}
        />
      )}
    </>
  );
}
