#!/usr/bin/env bash
# Ajusta nginx al puerto REAL de PARAGON.
#
# Si el puerto 4000 estaba ocupado, el servidor elige otro libre y lo anota en backend/.port.
# systemd ejecuta este script como root justo después de arrancar (ExecStartPost=+...): lee ese puerto,
# actualiza el "proxy_pass" de nginx y recarga nginx solo si hizo falta. También puedes ejecutarlo a mano.
set -euo pipefail

PORT_FILE="${PORT_FILE:-/opt/paragon/backend/.port}"
SITE="${NGINX_SITE:-/etc/nginx/sites-available/paragon}"

START=$(date +%s)
# Espera (hasta 20 s) a que el servidor escriba un puerto NUEVO (no el de una ejecución anterior).
for _ in $(seq 1 40); do
  if [ -s "$PORT_FILE" ] && [ "$(stat -c %Y "$PORT_FILE")" -ge "$START" ]; then break; fi
  sleep 0.5
done

if [ ! -s "$PORT_FILE" ]; then
  echo "sync-nginx-port: no se encontró $PORT_FILE (¿arrancó el servidor?)" >&2
  exit 0   # no bloquea el arranque del servicio
fi

PORT=$(tr -dc '0-9' < "$PORT_FILE")
[ -n "$PORT" ] || exit 0
[ -f "$SITE" ] || { echo "sync-nginx-port: no existe $SITE; nada que ajustar" >&2; exit 0; }

if grep -q "proxy_pass http://127.0.0.1:${PORT};" "$SITE"; then
  echo "sync-nginx-port: nginx ya apunta al puerto $PORT"
else
  sed -i -E "s#(proxy_pass http://127\.0\.0\.1:)[0-9]+;#\1${PORT};#" "$SITE"
  nginx -t && systemctl reload nginx
  echo "sync-nginx-port: nginx ahora apunta al puerto $PORT"
fi
