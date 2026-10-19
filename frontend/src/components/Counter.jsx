import React, { useEffect, useState } from 'react';
import useReveal from './useReveal';

export default function Counter({ value, suffix = '', duration = 1600 }) {
  const [ref, visible] = useReveal(0.4);
  const [n, setN] = useState(0);

  useEffect(() => {
    if (!visible) return undefined;
    let raf;
    const start = performance.now();
    const tick = (now) => {
      const p = Math.min((now - start) / duration, 1);
      setN(Math.round(value * (1 - Math.pow(1 - p, 3))));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [visible, value, duration]);

  return <span ref={ref}>{n}{suffix}</span>;
}
