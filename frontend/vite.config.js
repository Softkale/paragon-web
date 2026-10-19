import fs from 'fs';
import path from 'path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// El backend elige un puerto libre si el 4000 está ocupado y lo anota en backend/.port.
// Arranca el backend primero; si su puerto cambia, reinicia este servidor de desarrollo.
function backendPort() {
  try {
    const port = Number(fs.readFileSync(path.resolve(process.cwd(), '../backend/.port'), 'utf8').trim());
    if (port > 0) return port;
  } catch {
    /* el backend aún no escribió el archivo */
  }
  return 4000;
}

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: { '/api': `http://localhost:${backendPort()}` },
  },
});
