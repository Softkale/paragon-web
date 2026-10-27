import { useEffect, useState } from 'react';
import { api } from '../api';

// Consulta una ruta de la API y la repite al cambiar `path` (null = no consultar). Mientras carga conserva el dato anterior (la paginación no parpadea).
export default function useFetch(path) {
  const [state, setState] = useState({ data: null, error: '', loading: true });
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!path) { setState({ data: null, error: '', loading: false }); return undefined; }
    let live = true;
    setState((s) => ({ ...s, error: '', loading: true }));
    api.get(path).then(
      (data) => live && setState({ data, error: '', loading: false }),
      (e) => live && setState({ data: null, error: e.message, loading: false }),
    );
    return () => { live = false; };
  }, [path, tick]);

  return { ...state, reload: () => setTick((t) => t + 1) };
}
