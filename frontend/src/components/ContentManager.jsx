import React, { useState } from 'react';
import { api } from '../api';
import useList from './useList';

// Alta, edición y borrado de una lista de contenido (eventos, noticias, leyendas).
// fields: { key, label, wide?, area?, optional?, number?, placeholder? }
export default function ContentManager({ path, fields, empty, render, hint }) {
  const [rows, reload, error] = useList(path);
  const [form, setForm] = useState(empty);
  const [editing, setEditing] = useState(null);

  const toPayload = () => Object.fromEntries(fields.map((f) => [f.key, f.number ? Number(form[f.key]) : form[f.key]]));

  const submit = async (e) => {
    e.preventDefault();
    try {
      if (editing) await api.put(`${path}/${editing}`, toPayload());
      else await api.post(path, toPayload());
      setForm(empty);
      setEditing(null);
      reload();
    } catch (err) { window.alert(err.message); }
  };

  const edit = (row) => {
    setEditing(row.id);
    setForm(Object.fromEntries(fields.map((f) => [f.key, row[f.key] ?? ''])));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const remove = async (row) => {
    if (!window.confirm('¿Eliminar este elemento? Dejará de verse en la web.')) return;
    try { await api.del(`${path}/${row.id}`); reload(); } catch (err) { window.alert(err.message); }
  };

  return (
    <>
      {hint && <p className="muted" style={{ marginBottom: 14 }}>{hint}</p>}
      <form className="card form-grid" onSubmit={submit}>
        <h4 className="field--wide cm-title">{editing ? 'Editando' : 'Agregar nuevo'}</h4>
        {fields.map((f) => (
          <label key={f.key} className={`field ${f.wide ? 'field--wide' : ''}`}>
            <span>{f.label}</span>
            {f.area ? (
              <textarea rows="3" value={form[f.key]} required={!f.optional} onChange={(e) => setForm({ ...form, [f.key]: e.target.value })} />
            ) : (
              <input
                type={f.number ? 'number' : 'text'}
                min={f.number ? 0 : undefined}
                step={f.number ? 1 : undefined}
                placeholder={f.placeholder}
                value={form[f.key]}
                required={!f.optional}
                onChange={(e) => setForm({ ...form, [f.key]: e.target.value })}
              />
            )}
          </label>
        ))}
        <div className="form-actions">
          <button className="btn btn--sm" type="submit">{editing ? 'Guardar cambios' : '+ Agregar'}</button>
          {editing && <button type="button" className="icon-btn" onClick={() => { setEditing(null); setForm(empty); }}>Cancelar</button>}
        </div>
      </form>
      {error && <div className="card empty">{error}</div>}
      {!rows.length && !error && <div className="card empty" style={{ marginTop: 22 }}>Aún no hay elementos. Agrega el primero con el formulario.</div>}
      <div className="grid grid--3" style={{ marginTop: 22 }}>
        {rows.map((r) => (
          <div key={r.id} className={`managed ${editing === r.id ? 'managed--editing' : ''}`}>
            {render(r)}
            <div className="managed__actions">
              <button className="icon-btn" title="Editar" onClick={() => edit(r)}>✏️</button>
              <button className="icon-btn" title="Eliminar" onClick={() => remove(r)}>🗑️</button>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
