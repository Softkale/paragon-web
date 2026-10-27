import React from 'react';

// El escudo de un clan en MU es una cuadrícula de 8x8 colores; el juego lo entrega como 64 dígitos hexadecimales.
const PALETTE = {
  0: 'transparent', 1: '#000000', 2: '#8c8a8d', 3: '#ffffff', 4: '#fe0000', 5: '#ff8a00', 6: '#ffff00', 7: '#8cff01',
  8: '#00ff00', 9: '#01ff8d', a: '#00ffff', b: '#008aff', c: '#0000fe', d: '#8c00ff', e: '#ff00fe', f: '#ff008c',
};

export default function GuildMark({ mark, size = 4 }) {
  if (!mark) return null;
  const cells = mark.toLowerCase().padEnd(64, '0').slice(0, 64).split('');
  return (
    <span className="gmark" style={{ width: size * 8 + 2, height: size * 8 + 2 }} aria-hidden="true">
      {cells.map((c, i) => <i key={i} style={{ background: PALETTE[c] || 'transparent' }} />)}
    </span>
  );
}
