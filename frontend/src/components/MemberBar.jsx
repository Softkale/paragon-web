import React from 'react';
import { Link, NavLink, useHistory } from 'react-router-dom';
import { useAuth } from '../AuthContext';

// Barra superior de las pantallas para miembros: asistencia propia y reporte de cajas.
export default function MemberBar() {
  const { user, logout } = useAuth();
  const history = useHistory();
  const isStaff = user.role !== 'miembro';

  return (
    <header className="checkin__top">
      <Link to="/" className="checkin__brand"><img src="/img/paragon-logo.jpg" alt="" /><span>PARAGON</span></Link>
      <nav className="memberbar__links">
        <NavLink to="/invasiones" activeClassName="is-on">Mi asistencia</NavLink>
        <NavLink to="/cajas" activeClassName="is-on">Cajas obtenidas</NavLink>
      </nav>
      <div className="checkin__user">
        <span>{user.name}</span>
        {isStaff && <Link to="/admin" className="icon-btn">Panel</Link>}
        <button className="icon-btn" onClick={() => { logout(); history.push('/login'); }}>Salir</button>
      </div>
    </header>
  );
}
