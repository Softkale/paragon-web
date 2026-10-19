#!/usr/bin/env bash
# =====================================================================================
#  PARAGON · instalador de UN SOLO COMANDO para Debian 12 (sirve también en Ubuntu)
#
#  Ejecútalo como root desde la carpeta del proyecto:
#
#     bash install.sh --domain paragon.tudominio.com --email tucorreo@dominio.com \
#                     --admin-name TuUsuario --admin-email tucorreo@dominio.com
#
#  Instala y configura TODO: paquetes, Node.js 22, PostgreSQL, nginx, el usuario del servicio, dependencias,
#  compilación de la web, base de datos, .env, administrador, servicio systemd, nginx, HTTPS, firewall y respaldos.
#  Es seguro repetirlo (actualiza lo que haga falta sin borrar datos).
#
#  Opciones:
#    --domain D          dominio de la web (su registro A debe apuntar a este servidor). Sin dominio: solo por IP, sin HTTPS.
#    --email E           correo para el certificado HTTPS (Let's Encrypt)
#    --admin-name N      usuario del primer administrador          --admin-email C    su correo
#    --no-https          no pedir certificado        --no-firewall   no tocar el firewall (ufw)
#    --update            antes de instalar hace "git pull" (si el proyecto es un repositorio Git)
#    --user U            usuario del sistema que ejecuta la app (por defecto: paragon)
#    --dry-run           muestra lo que haría sin ejecutar nada
# =====================================================================================
set -euo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_USER="paragon"
NODE_MAJOR=22
DOMAIN=""; EMAIL=""; ADMIN_NAME=""; ADMIN_EMAIL=""
FIREWALL=1; HTTPS=1; DRY=0; UPDATE=0

# ---------- utilidades ----------
if [ -t 1 ]; then B=$'\033[1m'; G=$'\033[32m'; Y=$'\033[33m'; R=$'\033[31m'; N=$'\033[0m'; else B=""; G=""; Y=""; R=""; N=""; fi
step() { printf '\n%s==> %s%s\n' "$B" "$*" "$N"; }
info() { printf '   %s✓%s %s\n' "$G" "$N" "$*"; }
warn() { printf '   %s!%s %s\n' "$Y" "$N" "$*" >&2; }
die()  { printf '\n%sError:%s %s\n' "$R" "$N" "$*" >&2; exit 1; }

run() { if [ "$DRY" -eq 1 ]; then printf '   [dry-run] %s\n' "$*"; else "$@"; fi; }
# Escribe el contenido que llega por stdin en un archivo.
write_file() { if [ "$DRY" -eq 1 ]; then printf '   [dry-run] escribiría %s\n' "$1"; cat >/dev/null; else cat > "$1"; fi; }
# Ejecuta un comando como el usuario del servicio, dentro de una carpeta.
as_app() {
  local dir="$1"; shift
  run runuser -u "$APP_USER" -- env HOME="$APP_DIR" npm_config_cache="$APP_DIR/.npm" bash -c 'cd "$1" && shift && "$@"' _ "$dir" "$@"
}

usage() { sed -n '2,24p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'; }

# ---------- argumentos ----------
while [ $# -gt 0 ]; do
  case "$1" in
    --domain)       DOMAIN="${2:-}"; shift 2 ;;
    --email)        EMAIL="${2:-}"; shift 2 ;;
    --admin-name)   ADMIN_NAME="${2:-}"; shift 2 ;;
    --admin-email)  ADMIN_EMAIL="${2:-}"; shift 2 ;;
    --user)         APP_USER="${2:-}"; shift 2 ;;
    --no-https)     HTTPS=0; shift ;;
    --no-firewall)  FIREWALL=0; shift ;;
    --update)       UPDATE=1; shift ;;
    --dry-run)      DRY=1; shift ;;
    -h|--help)      usage; exit 0 ;;
    *)              die "Opción desconocida: $1 (usa --help)" ;;
  esac
done

# ---------- comprobaciones ----------
step "Comprobando el servidor"
if [ "$DRY" -eq 0 ]; then
  [ "$(id -u)" -eq 0 ] || die "Ejecútalo como root:  sudo bash install.sh ..."
  command -v apt-get >/dev/null || die "Este instalador es para Debian/Ubuntu (necesita apt-get)."
  case "$APP_DIR" in /root|/root/*) die "El proyecto está dentro de /root y el usuario del servicio no podría leerlo. Muévelo a /opt/paragon o /srv/paragon y vuelve a ejecutar." ;; esac
  [ -f "$APP_DIR/backend/package.json" ] && [ -f "$APP_DIR/frontend/package.json" ] || die "No encuentro backend/ y frontend/ junto a install.sh ($APP_DIR)."
  . /etc/os-release 2>/dev/null || true
  case "${ID:-}" in debian|ubuntu) info "Sistema: ${PRETTY_NAME:-$ID}" ;; *) warn "Sistema no probado (${PRETTY_NAME:-desconocido}); se continúa de todos modos." ;; esac
else
  info "Modo de prueba (--dry-run): no se ejecuta nada"
fi
info "Carpeta del proyecto: $APP_DIR"

# Si falta el usuario/correo del admin y hay terminal, los pregunta.
if [ -z "$ADMIN_NAME" ] && [ "$DRY" -eq 0 ] && [ -t 0 ]; then
  read -r -p "   Usuario para el primer administrador: " ADMIN_NAME
  read -r -p "   Correo del administrador: " ADMIN_EMAIL
fi
[ -z "$EMAIL" ] && EMAIL="$ADMIN_EMAIL"
if [ -n "$DOMAIN" ] && [ "$HTTPS" -eq 1 ] && [ -z "$EMAIL" ]; then
  warn "Sin --email no se puede pedir el certificado HTTPS; se instalará solo con HTTP."
  HTTPS=0
fi
if { [ -n "$ADMIN_NAME" ] && [ -z "$ADMIN_EMAIL" ]; } || { [ -z "$ADMIN_NAME" ] && [ -n "$ADMIN_EMAIL" ]; }; then
  die "Indica --admin-name y --admin-email juntos."
fi

# ---------- 1) actualizar código (opcional) ----------
if [ "$UPDATE" -eq 1 ]; then
  step "Actualizando el código (git pull)"
  if [ -d "$APP_DIR/.git" ]; then run git -c safe.directory="$APP_DIR" -C "$APP_DIR" pull --ff-only; else warn "No es un repositorio Git; se omite."; fi
fi

# ---------- 2) paquetes del sistema ----------
step "Instalando paquetes del sistema (nginx, PostgreSQL, certbot, ufw…)"
export DEBIAN_FRONTEND=noninteractive
run apt-get update -y
run apt-get install -y curl git ca-certificates gnupg nginx postgresql postgresql-client ufw certbot python3-certbot-nginx cron unattended-upgrades
run systemctl enable --now postgresql
run systemctl enable --now nginx
info "Paquetes listos"

# ---------- 3) Node.js ----------
step "Node.js $NODE_MAJOR"
if command -v node >/dev/null 2>&1 && [ "$(node -p 'process.versions.node.split(".")[0]')" -ge 20 ]; then
  info "Ya está instalado: $(node -v)"
else
  run bash -c "curl -fsSL https://deb.nodesource.com/setup_${NODE_MAJOR}.x | bash -"
  run apt-get install -y nodejs
  [ "$DRY" -eq 1 ] || info "Instalado: $(node -v)"
fi
NODE_BIN="$(command -v node || echo /usr/bin/node)"

# ---------- 4) usuario del servicio ----------
step "Usuario del servicio ($APP_USER)"
if id "$APP_USER" >/dev/null 2>&1; then
  info "Ya existe"
else
  run useradd --system --user-group --no-create-home --home-dir "$APP_DIR" --shell /bin/bash "$APP_USER"
  info "Creado"
fi
run chown -R "$APP_USER:$APP_USER" "$APP_DIR"
run chmod +x "$APP_DIR/deploy/"*.sh "$APP_DIR/install.sh"
if [ "$DRY" -eq 0 ] && ! runuser -u "$APP_USER" -- test -r "$APP_DIR/backend/package.json"; then
  die "El usuario $APP_USER no puede leer $APP_DIR (revisa los permisos de las carpetas superiores)."
fi

# ---------- 5) dependencias y compilación ----------
step "Instalando dependencias y compilando la web (puede tardar un par de minutos)"
as_app "$APP_DIR/frontend" npm ci --no-audit --no-fund
as_app "$APP_DIR/frontend" npm run build
as_app "$APP_DIR/backend" npm ci --omit=dev --no-audit --no-fund
info "Web compilada y dependencias instaladas"

# ---------- 6) .env, base de datos, tablas y administrador ----------
step "Creando .env, base de datos, tablas y administrador"
SETUP_LOG="$(mktemp)"
trap 'rm -f "$SETUP_LOG"' EXIT
SETUP_ARGS=(--production --yes)
[ -n "$ADMIN_NAME" ] && SETUP_ARGS+=(--admin-name "$ADMIN_NAME" --admin-email "$ADMIN_EMAIL")
if [ "$DRY" -eq 1 ]; then
  printf '   [dry-run] (cd %s/backend && node scripts/setup.js %s)\n' "$APP_DIR" "${SETUP_ARGS[*]}"
else
  ( cd "$APP_DIR/backend" && node scripts/setup.js "${SETUP_ARGS[@]}" ) 2>&1 | tee "$SETUP_LOG" || die "Falló la creación de la base de datos o del .env (mira el mensaje de arriba)."
fi
ADMIN_PASS=""
[ "$DRY" -eq 1 ] || ADMIN_PASS="$(grep -E 'Contraseña:' "$SETUP_LOG" | tail -1 | sed -E 's/.*Contraseña:[[:space:]]+([^ ]+).*/\1/' || true)"

# ---------- 7) nginx ----------
step "Configurando nginx"
SITE=/etc/nginx/sites-available/paragon
if [ "$DRY" -eq 0 ] && [ -f "$SITE" ]; then
  info "La configuración de nginx ya existe: no se toca (conserva el HTTPS)"
else
  if [ -n "$DOMAIN" ]; then SERVER_NAME="$DOMAIN"; LISTEN_EXTRA=""; else SERVER_NAME="_"; LISTEN_EXTRA=" default_server"; fi
  write_file "$SITE" <<EOF
# Generado por install.sh. Si el puerto de la app cambia, deploy/sync-nginx-port.sh ajusta "proxy_pass" solo.
server {
    listen 80${LISTEN_EXTRA};
    listen [::]:80${LISTEN_EXTRA};
    server_name ${SERVER_NAME};

    client_max_body_size 2m;

    gzip on;
    gzip_types text/css application/javascript application/json image/svg+xml;
    gzip_min_length 1024;

    location / {
        proxy_pass http://127.0.0.1:4000;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_read_timeout 60s;
    }
}
EOF
  run rm -f /etc/nginx/sites-enabled/default
  run ln -sf "$SITE" /etc/nginx/sites-enabled/paragon
  run nginx -t
  run systemctl reload nginx
  info "nginx configurado${DOMAIN:+ para $DOMAIN}"
fi

# ---------- 8) servicio systemd ----------
step "Creando el servicio systemd"
run mkdir -p "$APP_DIR/backend/outbox"
run chown "$APP_USER:$APP_USER" "$APP_DIR/backend/outbox"
write_file /etc/systemd/system/paragon.service <<EOF
# Generado por install.sh
[Unit]
Description=PARAGON (web + API)
After=network.target postgresql.service
Wants=postgresql.service

[Service]
Type=simple
User=${APP_USER}
WorkingDirectory=${APP_DIR}/backend
EnvironmentFile=${APP_DIR}/backend/.env
ExecStart=${NODE_BIN} src/server.js
# El "+" lo ejecuta como root: si el puerto 4000 estaba ocupado, ajusta nginx al puerto real.
ExecStartPost=+${APP_DIR}/deploy/sync-nginx-port.sh
Restart=always
RestartSec=3

# Endurecimiento básico
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=full

[Install]
WantedBy=multi-user.target
EOF
run systemctl daemon-reload
run systemctl enable paragon
run systemctl restart paragon

if [ "$DRY" -eq 0 ]; then
  PORT=""
  for _ in $(seq 1 40); do
    [ -s "$APP_DIR/backend/.port" ] && PORT="$(cat "$APP_DIR/backend/.port")" && curl -fsS "http://127.0.0.1:${PORT}/api/health" >/dev/null 2>&1 && break
    sleep 1
  done
  if curl -fsS "http://127.0.0.1:${PORT:-4000}/api/health" >/dev/null 2>&1; then
    info "La aplicación responde en el puerto ${PORT}"
  else
    journalctl -u paragon -n 30 --no-pager || true
    die "El servicio no arrancó. Revisa el registro de arriba (journalctl -u paragon -n 50)."
  fi
fi

# ---------- 9) HTTPS ----------
URL="http://${DOMAIN:-$(hostname -I 2>/dev/null | awk '{print $1}')}"
if [ -n "$DOMAIN" ] && [ "$HTTPS" -eq 1 ]; then
  step "HTTPS con Let's Encrypt para $DOMAIN"
  PUBLIC_IP="$(curl -fsS --max-time 8 https://api.ipify.org 2>/dev/null || true)"
  DOMAIN_IP="$(getent ahostsv4 "$DOMAIN" 2>/dev/null | awk '{print $1; exit}' || true)"
  if [ "$DRY" -eq 0 ] && [ -n "$PUBLIC_IP" ] && [ -n "$DOMAIN_IP" ] && [ "$PUBLIC_IP" != "$DOMAIN_IP" ]; then
    warn "$DOMAIN apunta a $DOMAIN_IP pero este servidor es $PUBLIC_IP. Corrige el registro A del dominio y repite:"
    warn "   certbot --nginx -d $DOMAIN --redirect -m $EMAIL --agree-tos"
  elif run certbot --nginx -d "$DOMAIN" --redirect --non-interactive --agree-tos -m "$EMAIL"; then
    URL="https://$DOMAIN"
    info "Certificado instalado (se renueva solo)"
  else
    warn "No se pudo obtener el certificado. La web funciona por HTTP; repite luego con:"
    warn "   certbot --nginx -d $DOMAIN --redirect -m $EMAIL --agree-tos"
  fi
fi

# ---------- 10) firewall ----------
if [ "$FIREWALL" -eq 1 ]; then
  step "Firewall (ufw)"
  SSH_PORT="$(sshd -T 2>/dev/null | awk '/^port /{print $2; exit}' || true)"
  SSH_PORT="${SSH_PORT:-22}"
  run ufw allow "${SSH_PORT}/tcp"
  run ufw allow 80/tcp
  run ufw allow 443/tcp
  run ufw --force enable
  info "Abiertos: SSH ($SSH_PORT), 80 y 443"
fi

# ---------- 11) respaldos y actualizaciones de seguridad ----------
step "Respaldos diarios y actualizaciones de seguridad"
run mkdir -p /var/backups/paragon
run chown "$APP_USER:$APP_USER" /var/backups/paragon
if [ "$DRY" -eq 1 ]; then
  printf '   [dry-run] cron de %s: 30 4 * * * %s/deploy/backup.sh\n' "$APP_USER" "$APP_DIR"
else
  CRON_TMP="$(mktemp)"
  { crontab -u "$APP_USER" -l 2>/dev/null | grep -v 'deploy/backup.sh' || true; echo "30 4 * * * $APP_DIR/deploy/backup.sh >> /var/backups/paragon/backup.log 2>&1"; } > "$CRON_TMP"
  crontab -u "$APP_USER" "$CRON_TMP"
  rm -f "$CRON_TMP"
fi
write_file /etc/apt/apt.conf.d/20auto-upgrades <<'EOF'
APT::Periodic::Update-Package-Lists "1";
APT::Periodic::Unattended-Upgrade "1";
EOF
info "Respaldo a las 04:30 (últimos 14 días en /var/backups/paragon) y parches de seguridad automáticos"

# ---------- resumen ----------
printf '\n%s============================================================%s\n' "$G" "$N"
printf '%s  PARAGON quedó instalado%s\n' "$B" "$N"
printf '%s============================================================%s\n' "$G" "$N"
printf '  Web:            %s\n' "$URL"
if [ -n "$ADMIN_NAME" ]; then
  printf '  Administrador:  %s\n' "$ADMIN_NAME"
  if [ -n "$ADMIN_PASS" ]; then
    printf '  Contraseña:     %s%s%s   (temporal, anótala: se pedirá cambiarla al ingresar)\n' "$B" "$ADMIN_PASS" "$N"
  else
    printf '  Contraseña:     (el administrador ya existía; si no la recuerdas: ver "Si nadie puede entrar" en el README)\n'
  fi
else
  printf '  Administrador:  aún no hay. Créalo con:\n'
  printf '                  cd %s/backend && su %s -c "npm run admin:create -- --name TuUsuario --email tucorreo@dominio.com"\n' "$APP_DIR" "$APP_USER"
fi
cat <<EOF

  Siguientes pasos (desde la web, entrando como administrador):
    1. Configuración → Correo (SMTP) y «Enviar correo de prueba».
    2. Contenido → textos de la portada y enlace del botón de contacto.
    3. Invasiones → crear la primera temporada.
    4. Miembros → crear a los miembros (o Carga masiva).

  Comandos útiles:
    systemctl status paragon           estado del servicio
    journalctl -u paragon -f           registros en vivo
    bash ${APP_DIR}/install.sh --update --domain ${DOMAIN:-TU_DOMINIO} ...   actualizar a una versión nueva
EOF
