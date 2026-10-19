import React, { useState } from 'react';

// Muestra una clave temporal una sola vez, con botón para copiarla.
export default function TempPassword({ name, password }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(password);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* el usuario puede copiarla a mano */
    }
  };
  return (
    <div className="temp-pass field--wide">
      <span>Clave temporal de <b>{name}</b> (anótala ahora: no se vuelve a mostrar)</span>
      <div className="temp-pass__row">
        <code>{password}</code>
        <button type="button" className="icon-btn" onClick={copy}>{copied ? '✓ Copiada' : 'Copiar'}</button>
      </div>
      <small>Debe cambiarla al iniciar sesión por primera vez.</small>
    </div>
  );
}
