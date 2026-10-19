import { useCallback, useEffect, useState } from 'react';
import { api } from '../api';

// Carga una lista de la API y expone la recarga.
export default function useList(path) {
  const [rows, setRows] = useState([]);
  const [error, setError] = useState('');
  const reload = useCallback(() => {
    api.get(path).then(setRows).catch((e) => setError(e.message));
  }, [path]);
  useEffect(reload, [reload]);
  return [rows, reload, error];
}
