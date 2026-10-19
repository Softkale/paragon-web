import React, { useState } from 'react';
import { Link, useHistory, useLocation } from 'react-router-dom';
import Embers from '../components/Embers';
import { api } from '../api';

// Pantalla a la que llega el enlace del correo de recuperación (/restablecer?token=...).
export default function ResetPassword() {
  const history = useHistory();
  const token = new URLSearchParams(useLocation().search).get('token') || '';
  const [form, setForm] = useState({ next: '', confirm: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    if (form.next !== form.confirm) return setError('Las contraseñas no coinciden');
    setBusy(true);
    try {
      await api.post('/auth/reset', { token, password: form.next });
      history.push('/login?reset=ok');
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
        <Link to="/" className="auth__logo"><img src="/img/paragon-logo.jpg" alt="PARAGON" /></Link>
        <h1>Elige tu nueva contraseña</h1>

        {!token ? (
          <>
            <p className="form-msg form-msg--error">Este enlace no es válido. Pide uno nuevo desde la pantalla de ingreso.</p>
            <Link to="/login" className="btn btn--block" style={{ textAlign: 'center' }}>Ir a ingresar</Link>
          </>
        ) : (
          <>
            <label className="field">
              <span>Nueva contraseña</span>
              <input type="password" minLength={8} value={form.next} onChange={set('next')} required autoComplete="new-password" />
            </label>
            <label className="field">
              <span>Repite la contraseña</span>
              <input type="password" minLength={8} value={form.confirm} onChange={set('confirm')} required autoComplete="new-password" />
            </label>
            <p className="auth__hint">Mínimo 8 caracteres.</p>
            {error && (
              <p className="form-msg form-msg--error">
                {error} {/expiró|válido/.test(error) && <Link to="/login" className="link">Pedir un enlace nuevo</Link>}
              </p>
            )}
            <button className="btn btn--block" type="submit" disabled={busy}>{busy ? 'Guardando…' : 'Guardar contraseña'}</button>
          </>
        )}
      </form>
    </main>
  );
}
