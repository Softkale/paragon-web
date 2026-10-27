import React, { useEffect, useState } from 'react';
import { Link, NavLink } from 'react-router-dom';
import { useAuth } from '../AuthContext';
import { useSite } from '../SiteContext';

const links = [
  ['#inicio', 'Inicio'],
  ['#eventos', 'Eventos'],
  ['/clanes?tab=nivel', 'Ranking'],
  ['#noticias', 'Noticias'],
  ['#unete', 'Únete'],
];

export default function Navbar() {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);
  const { user } = useAuth();
  const site = useSite();

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 40);
    onScroll();
    window.addEventListener('scroll', onScroll);
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <header className={`nav ${scrolled ? 'nav--solid' : ''}`}>
      <Link to="/" className="nav__brand">
        <img src="/img/paragon-logo.jpg" alt="" />
        <span>PARAGON</span>
      </Link>
      <nav className={`nav__links ${open ? 'is-open' : ''}`}>
        {links.filter(([href]) => href !== '#unete' || site.cta_url).map(([href, label]) => (href.startsWith('#') ? (
          <a key={href} href={`/${href}`} onClick={() => setOpen(false)}>
            {label}
          </a>
        ) : (
          <Link key={href} to={href} onClick={() => setOpen(false)}>
            {label}
          </Link>
        )))}
        <Link to="/clanes" onClick={() => setOpen(false)}>Clanes</Link>
        {user ? (
          <NavLink to={user.role === 'miembro' ? '/invasiones' : '/admin'} className="btn btn--sm" onClick={() => setOpen(false)}>
            {user.role === 'miembro' ? 'Mi reporte' : 'Panel'}
          </NavLink>
        ) : (
          <NavLink to="/login" className="btn btn--sm" onClick={() => setOpen(false)}>
            Ingresar
          </NavLink>
        )}
      </nav>
      <button className="nav__burger" onClick={() => setOpen(!open)} aria-label="Menú">
        <span /><span /><span />
      </button>
    </header>
  );
}
