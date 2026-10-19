import React from 'react';
import { useSite } from '../SiteContext';

export default function Footer() {
  const site = useSite();
  return (
    <footer className="footer">
      <img src="/img/paragon-logo.jpg" alt="" />
      <p>© {new Date().getFullYear()} {site.hero_title} · {site.footer_text}</p>
    </footer>
  );
}
