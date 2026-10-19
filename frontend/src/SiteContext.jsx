import React, { createContext, useContext, useEffect, useState } from 'react';
import { api } from './api';

// Valores por defecto mientras carga (o si la API no responde): los mismos textos originales.
const FALLBACK = {
  hero_kicker: 'Guild de Smash MU',
  hero_title: 'PARAGON',
  hero_subtitle: 'Forjados en fuego. Unidos en cada invasión.',
  hero_primary: 'Únete a la guild',
  hero_secondary: 'Ver eventos',
  events_title: 'Eventos e invasiones',
  ranking_title: 'Salón de leyendas',
  news_title: 'Últimas noticias',
  cta_title: '¿Quieres unirte a PARAGON?',
  cta_text: 'Habla con un oficial de la guild para que te den acceso.',
  cta_button: 'Contactar',
  cta_url: '',
  footer_text: 'Guild de Smash MU. Forjados en fuego.',
  stats: [],
};

const SiteContext = createContext(FALLBACK);
export const useSite = () => useContext(SiteContext);

// Textos y cifras editables de la portada (se cargan una vez al abrir la web).
export function SiteProvider({ children }) {
  const [site, setSite] = useState(FALLBACK);
  useEffect(() => { api.get('/site').then(setSite).catch(() => {}); }, []);
  return <SiteContext.Provider value={site}>{children}</SiteContext.Provider>;
}
