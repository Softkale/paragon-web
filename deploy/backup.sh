#!/usr/bin/env bash
# Respaldo diario de la base de datos. Conserva los últimos 14 días.
#
# Instalación:
#   sudo mkdir -p /var/backups/paragon && sudo chown paragon: /var/backups/paragon
#   sudo -u paragon crontab -e   ->   30 4 * * * /opt/paragon/deploy/backup.sh
#
# Necesita que el usuario paragon pueda conectarse a PostgreSQL sin pedir clave: crea ~/.pgpass
#   localhost:5432:paragon:paragon:LA_CLAVE   (chmod 600)
set -euo pipefail

DIR=/var/backups/paragon
mkdir -p "$DIR"
FILE="$DIR/paragon-$(date +%F).dump"

pg_dump -h localhost -U paragon -d paragon -Fc -f "$FILE"
find "$DIR" -name 'paragon-*.dump' -mtime +14 -delete
echo "Respaldo guardado: $FILE"

# Restaurar (en una base vacía):  pg_restore -h localhost -U paragon -d paragon --clean --if-exists ARCHIVO.dump
