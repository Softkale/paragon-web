import React, { createContext, useContext, useEffect, useState } from 'react';
import { api, getToken, setToken } from './api';

const AuthContext = createContext(null);
export const useAuth = () => useContext(AuthContext);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(!!getToken());

  // Restaura la sesión si hay un token guardado.
  useEffect(() => {
    if (!getToken()) return;
    api.get('/auth/me')
      .then((me) => setUser({ id: me.id, name: me.character_name, role: me.role, mustChange: me.must_change_password }))
      .catch(() => setToken(null))
      .finally(() => setLoading(false));
  }, []);

  // Guarda la sesión que devuelve el servidor (login o cambio de contraseña).
  const applySession = (data) => {
    setToken(data.token);
    setUser(data.user);
    return data.user;
  };

  const login = async (username, password) => applySession(await api.post('/auth/login', { username, password }));

  const changePassword = async (current_password, new_password) =>
    applySession(await api.post('/auth/change-password', { current_password, new_password }));

  const logout = () => {
    setToken(null);
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, changePassword, logout }}>{children}</AuthContext.Provider>
  );
}
