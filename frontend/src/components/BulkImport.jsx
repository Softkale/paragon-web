import React, { useState } from 'react';
import { api } from '../api';

const KEYS = {
  character_name: ['usuario', 'user', 'username', 'personaje', 'nombre', 'nick'],
  email: ['correo', 'email', 'mail', 'e-mail'],
  character_class: ['clase', 'class'],
  role: ['rol', 'role'],
};
const POSITIONAL = ['character_name', 'email', 'character_class', 'role'];

const TEMPLATE = '﻿usuario;correo;clase;rol\r\nEjemploUno;ejemplo1@correo.com;Blade Knight;miembro\r\nEjemploDos;ejemplo2@correo.com;Soul Master;miembro\r\n';

// Separa una línea respetando comillas dobles.
function splitLine(line, d) {
  const out = [];
  let cur = '';
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const c = line[i];
    if (quoted) {
      if (c === '"') {
        if (line[i + 1] === '"') { cur += '"'; i += 1; } else quoted = false;
      } else cur += c;
    } else if (c === '"') quoted = true;
    else if (c === d) { out.push(cur); cur = ''; } else cur += c;
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

// Convierte el texto (CSV de Excel con ; o ,, o pegado con tabulaciones) en filas de usuario.
export function parseUsers(text) {
  const lines = text.replace(/^﻿/, '').split(/\r?\n/).filter((l) => l.trim());
  if (!lines.length) return [];
  const delim = [';', '\t', ','].map((d) => [d, lines[0].split(d).length]).sort((a, b) => b[1] - a[1])[0][0];
  const table = lines.map((l) => splitLine(l, delim));

  // ¿La primera fila es un encabezado? (nombres de columna conocidos y sin '@')
  const first = table[0].map((c) => c.toLowerCase());
  const isHeader = !first.some((c) => c.includes('@')) && first.some((c) => Object.values(KEYS).flat().includes(c));
  let order = POSITIONAL;
  if (isHeader) {
    order = first.map((c) => Object.keys(KEYS).find((k) => KEYS[k].includes(c)) || null);
  }
  return (isHeader ? table.slice(1) : table).map((cells) => {
    const row = {};
    cells.forEach((v, i) => { if (order[i]) row[order[i]] = v; });
    return row;
  });
}

// Carga masiva: pegar o subir CSV → revisar (sin crear nada) → confirmar y enviar las invitaciones.
export default function BulkImport({ onDone, onClose }) {
  const [text, setText] = useState('');
  const [rows, setRows] = useState([]);
  const [preview, setPreview] = useState(null);
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const reset = () => { setText(''); setRows([]); setPreview(null); setResult(null); setError(''); };

  const readFile = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => { setText(String(reader.result)); setPreview(null); setResult(null); };
    reader.readAsText(file, 'utf-8');
    e.target.value = '';
  };

  const downloadTemplate = () => {
    const url = URL.createObjectURL(new Blob([TEMPLATE], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = 'PARAGON_plantilla_usuarios.csv';
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const review = async () => {
    setError('');
    setResult(null);
    const parsed = parseUsers(text);
    if (!parsed.length) return setError('No encontré filas. Pega la lista o sube un archivo.');
    if (parsed.length > 200) return setError(`Hay ${parsed.length} filas; el máximo por carga es 200. Divide el archivo.`);
    setBusy(true);
    try {
      setRows(parsed);
      setPreview(await api.post('/users/bulk?dryRun=1', { users: parsed }));
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const confirm = async () => {
    if (!window.confirm(`¿Crear ${preview.summary.ok} usuarios y enviarles sus accesos por correo?`)) return;
    setBusy(true);
    setError('');
    try {
      setResult(await api.post('/users/bulk', { users: rows }));
      setPreview(null);
      onDone();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const shown = result || preview;

  return (
    <div className="card bulk">
      <div className="toolbar" style={{ marginBottom: 12 }}>
        <h3 className="admin-h" style={{ margin: 0 }}>Carga masiva de usuarios</h3>
        <button className="icon-btn" onClick={onClose}>Cerrar</button>
      </div>
      <p className="muted bulk__help">
        Una fila por jugador con estas columnas: <b>usuario</b>, <b>correo</b>, <b>clase</b> (opcional) y <b>rol</b> (opcional: miembro u oficial; solo el admin puede crear oficiales).
        Pega la lista o sube un CSV de Excel. Cada usuario recibirá un correo con una contraseña temporal y quedará como
        <b> «Invitación pendiente»</b> hasta que cambie su clave.
      </p>

      {!result && (
        <>
          <div className="form-actions" style={{ marginBottom: 10 }}>
            <label className="icon-btn bulk__file">⬆ Subir CSV<input type="file" accept=".csv,.txt,.tsv,text/csv,text/plain" onChange={readFile} hidden /></label>
            <button className="icon-btn" onClick={downloadTemplate}>⬇ Descargar plantilla</button>
          </div>
          <textarea
            className="bulk__text"
            rows="7"
            placeholder={'usuario;correo;clase;rol\nAbyJG;aby@correo.com;Soul Master;miembro\nAngeluz;angeluz@correo.com'}
            value={text}
            onChange={(e) => { setText(e.target.value); setPreview(null); }}
          />
          <div className="form-actions" style={{ marginTop: 12 }}>
            <button className="btn btn--sm" onClick={review} disabled={busy || !text.trim()}>{busy && !preview ? 'Revisando…' : 'Revisar'}</button>
            {text && <button className="icon-btn" onClick={reset}>Limpiar</button>}
          </div>
        </>
      )}
      {error && <p className="form-msg form-msg--error" style={{ marginTop: 12 }}>{error}</p>}

      {shown && (
        <div style={{ marginTop: 18 }}>
          <div className="bulk__summary">
            <span className="status status--activo">{shown.summary.ok} {result ? 'creados' : 'válidas'}</span>
            {shown.summary.failed > 0 && <span className="status status--rechazado">{shown.summary.failed} con error</span>}
            {result && shown.summary.emailsSent > 0 && <span className="status status--pendiente">{shown.summary.emailsSent} correos enviados</span>}
          </div>
          {result && !result.smtpConfigured && shown.summary.ok > 0 && (
            <p className="form-msg form-msg--error" style={{ margin: '12px 0' }}>
              El correo (SMTP) aún no está configurado: los accesos se guardaron en <code>backend/outbox</code> y <b>no se enviaron</b>. Cuando lo configures, usa «Reenviar a pendientes».
            </p>
          )}
          {result && result.smtpConfigured && shown.summary.emailsFailed > 0 && (
            <p className="form-msg form-msg--error" style={{ margin: '12px 0' }}>
              {shown.summary.emailsFailed} correos no se pudieron enviar. Esos usuarios quedaron creados; usa «Reenviar a pendientes» para reintentar.
            </p>
          )}
          <div className="table-wrap bulk__table">
            <table className="table">
              <thead><tr><th>Fila</th><th>Usuario</th><th>Correo</th><th>Rol</th><th>Resultado</th></tr></thead>
              <tbody>
                {shown.results.map((r) => (
                  <tr key={r.row} className={r.ok ? '' : 'bulk__bad'}>
                    <td>{r.row}</td>
                    <td><b>{r.name || '—'}</b></td>
                    <td>{r.email || '—'}</td>
                    <td>{r.role}</td>
                    <td>
                      {!r.ok && <span className="bulk__err">✕ {r.error}</span>}
                      {r.ok && !result && <span className="bulk__ok">✓ Lista para crear</span>}
                      {r.ok && result && (r.emailSent ? <span className="bulk__ok">✓ Creado · invitación enviada</span> : <span className="bulk__warn">✓ Creado · correo sin enviar</span>)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {preview && (
            <div className="form-actions" style={{ marginTop: 14 }}>
              <button className="btn btn--sm" onClick={confirm} disabled={busy || preview.summary.ok === 0}>
                {busy ? 'Creando…' : `Crear e invitar ${preview.summary.ok} usuarios`}
              </button>
              {preview.summary.failed > 0 && <span className="muted">Las filas con error se omiten; corrígelas arriba y vuelve a revisar si quieres incluirlas.</span>}
            </div>
          )}
          {result && <div className="form-actions" style={{ marginTop: 14 }}><button className="btn btn--sm" onClick={reset}>Cargar otro archivo</button></div>}
        </div>
      )}
    </div>
  );
}
