import React, { useState } from 'react';
import { Redirect, useHistory } from 'react-router-dom';
import Embers from '../components/Embers';
import { useAuth } from '../AuthContext';

export default function ChangePassword() {
  const { user, loading, changePassword, logout } = useAuth();
  const history = useHistory();
  const [form, setForm] = useState({ current: '', next: '', confirm: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  if (loading) return null;
  if (!user) return <Redirect to="/login" />;

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    if (form.next !== form.confirm) return setError('Las contraseñas nuevas no coinciden');
    setBusy(true);
    try {
      const updated = await changePassword(form.current, form.next);
      history.push(updated.role === 'miembro' ? '/invasiones' : '/admin');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="auth">
      <Embers count={25} />
      <form className="auth__card" onSubmit={submit}>
        <div className="auth__logo"><img src="/img/paragon-logo.jpg" alt="PARAGON" /></div>
        <h1>Cambia tu contraseña</h1>
        <p className="auth__hint">
          {user.mustChange
            ? `Hola ${user.name}. Ingresaste con una contraseña temporal; elige una nueva para continuar.`
            : 'Elige una nueva contraseña para tu cuenta.'}
        </p>

        <label className="field">
          <span>Contraseña actual (la del correo)</span>
          <input type="password" value={form.current} onChange={set('current')} required autoComplete="current-password" />
        </label>
        <label className="field">
          <span>Nueva contraseña</span>
          <input type="password" minLength={8} value={form.next} onChange={set('next')} required autoComplete="new-password" />
        </label>
        <label className="field">
          <span>Repite la nueva contraseña</span>
          <input type="password" minLength={8} value={form.confirm} onChange={set('confirm')} required autoComplete="new-password" />
        </label>

        {error && <p className="form-msg form-msg--error">{error}</p>}

        <button className="btn btn--block" type="submit" disabled={busy}>{busy ? 'Guardando…' : 'Guardar y continuar'}</button>
        <button type="button" className="link auth__back auth__plain" onClick={() => { logout(); history.push('/login'); }}>
          Cerrar sesión
        </button>
      </form>
    </main>
  );
}
