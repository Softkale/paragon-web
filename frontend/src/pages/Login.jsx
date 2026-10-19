import React, { useState } from 'react';
import { Link, useHistory, useLocation } from 'react-router-dom';
import Embers from '../components/Embers';
import { api } from '../api';
import { useAuth } from '../AuthContext';

// Ingreso con usuario y contraseña. No hay registro público: las cuentas las crean los oficiales
// y llegan por correo. Quien olvidó su clave puede pedir un enlace para restablecerla.
export default function Login() {
  const history = useHistory();
  const { search } = useLocation();
  const { login } = useAuth();
  const [mode, setMode] = useState('login'); // login | forgot
  const [form, setForm] = useState({ username: '', password: '', identifier: '' });
  const [error, setError] = useState('');
  const [info, setInfo] = useState(new URLSearchParams(search).get('reset') === 'ok' ? 'Contraseña actualizada. Ya puedes iniciar sesión.' : '');
  const [busy, setBusy] = useState(false);

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  const switchMode = (m) => { setMode(m); setError(''); setInfo(''); };

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setInfo('');
    setBusy(true);
    try {
      if (mode === 'login') {
        const user = await login(form.username, form.password);
        history.push(user.mustChange ? '/cambiar-clave' : user.role === 'miembro' ? '/invasiones' : '/admin');
      } else {
        const res = await api.post('/auth/forgot', { identifier: form.identifier });
        setInfo(res.message);
      }
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
        <Link to="/" className="auth__logo">
          <img src="/img/paragon-logo.jpg" alt="PARAGON" />
        </Link>
        <h1>{mode === 'login' ? 'Bienvenido de vuelta' : 'Recupera tu contraseña'}</h1>

        {mode === 'login' ? (
          <>
            <label className="field">
              <span>Usuario</span>
              <input type="text" placeholder="Tu nombre de personaje" value={form.username} onChange={set('username')} required autoComplete="username" />
            </label>
            <label className="field">
              <span>Contraseña</span>
              <input type="password" placeholder="••••••••" value={form.password} onChange={set('password')} required autoComplete="current-password" />
            </label>
          </>
        ) : (
          <>
            <p className="auth__hint">Escribe tu usuario o tu correo y te enviaremos un enlace para elegir una nueva contraseña.</p>
            <label className="field">
              <span>Usuario o correo</span>
              <input type="text" placeholder="Tu usuario o correo" value={form.identifier} onChange={set('identifier')} required autoComplete="username" />
            </label>
          </>
        )}

        {error && <p className="form-msg form-msg--error">{error}</p>}
        {info && <p className="form-msg form-msg--ok">{info}</p>}

        <button className="btn btn--block" type="submit" disabled={busy}>
          {busy ? 'Enviando…' : mode === 'login' ? 'Entrar' : 'Enviar enlace'}
        </button>
        {mode === 'login' ? (
          <button type="button" className="link auth__back auth__plain" onClick={() => switchMode('forgot')}>¿Olvidaste tu contraseña?</button>
        ) : (
          <button type="button" className="link auth__back auth__plain" onClick={() => switchMode('login')}>← Volver a ingresar</button>
        )}
        <Link to="/" className="link auth__back">Ir al inicio</Link>
        {mode === 'login' && <p className="auth__hint auth__note">¿Aún no tienes cuenta? Un oficial de la guild te enviará tus accesos por correo.</p>}
      </form>
    </main>
  );
}
