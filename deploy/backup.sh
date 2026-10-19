#!/usr/bin/env bash
# Respaldo diario de la base de datos. Conserva los últimos 14 días.
# Lee la conexión de backend/.env (DATABASE_URL), así no hay que configurar claves aparte.
#
# Instalación:
#   mkdir -p /var/backups/paragon && chown paragon:paragon /var/backups/paragon
#   (crontab -u paragon -l 2>/dev/null; echo '30 4 * * * /opt/paragon/deploy/backup.sh') | crontab -u paragon -
set -euo pipefail

ENV_FILE="${ENV_FILE:-/opt/paragon/backend/.env}"
DIR="${BACKUP_DIR:-/var/backups/paragon}"

DB_URL=$(grep -E '^DATABASE_URL=' "$ENV_FILE" | head -1 | cut -d= -f2-)
[ -n "$DB_URL" ] || { echo "backup: no se encontró DATABASE_URL en $ENV_FILE" >&2; exit 1; }

mkdir -p "$DIR"
FILE="$DIR/paragon-$(date +%F).dump"

pg_dump "$DB_URL" -Fc -f "$FILE"
find "$DIR" -name 'paragon-*.dump' -mtime +14 -delete
echo "Respaldo guardado: $FILE"

# Restaurar (en una base vacía):  pg_restore -d "$DB_URL" --clean --if-exists ARCHIVO.dump
