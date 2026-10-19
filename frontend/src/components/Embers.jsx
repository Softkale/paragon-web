import React, { useMemo } from 'react';

// Brasas flotantes de fondo (solo CSS, posiciones aleatorias estables).
export default function Embers({ count = 40 }) {
  const embers = useMemo(
    () =>
      Array.from({ length: count }, (_, i) => ({
        id: i,
        left: Math.random() * 100,
        size: 2 + Math.random() * 4,
        delay: Math.random() * 12,
        duration: 8 + Math.random() * 10,
        drift: (Math.random() - 0.5) * 120,
      })),
    [count]
  );

  return (
    <div className="embers" aria-hidden="true">
      {embers.map((e) => (
        <span
          key={e.id}
          style={{
            left: `${e.left}%`,
            width: e.size,
            height: e.size,
            animationDelay: `${e.delay}s`,
            animationDuration: `${e.duration}s`,
            '--drift': `${e.drift}px`,
          }}
        />
      ))}
    </div>
  );
}
