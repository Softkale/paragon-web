import { useEffect, useState } from 'react';

// Devuelve `value` con retraso: solo cambia cuando deja de variar durante `ms`.
export default function useDebounced(value, ms) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}
