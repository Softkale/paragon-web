#!/usr/bin/env bash
# =====================================================================================
#  Correo de salida PROPIO en este servidor: Postfix (solo envío) + firma DKIM (OpenDKIM).
#
#  PARAGON entrega sus correos a 127.0.0.1:25 y Postfix los entrega directo al destinatario, sin depender del SMTP
#  de ningún hosting ni de servicios externos. Es solo para SALIR: el correo que LLEGA a tus buzones sigue yendo a donde
#  apunte el MX de tu dominio (no se recibe nada en este servidor).
#
#    sudo bash deploy/setup-local-mail.sh --domain paragon.tudominio.com
#
#  Opciones:  --domain D (obligatorio)   --selector S (por defecto "paragon")   --force   --dry-run
#  Es seguro repetirlo. Al terminar muestra el registro DNS de DKIM que debes publicar y qué más configurar.
# =====================================================================================
set -euo pipefail

DOMAIN=""; SELECTOR="paragon"; FORCE=0; DRY=0

if [ -t 1 ]; then B=$'\033[1m'; G=$'\033[32m'; Y=$'\033[33m'; R=$'\033[31m'; N=$'\033[0m'; else B=""; G=""; Y=""; R=""; N=""; fi
step() { printf '\n%s==> %s%s\n' "$B" "$*" "$N"; }
info() { printf '   %s✓%s %s\n' "$G" "$N" "$*"; }
warn() { printf '   %s!%s %s\n' "$Y" "$N" "$*" >&2; }
die()  { printf '\n%sError:%s %s\n' "$R" "$N" "$*" >&2; exit 1; }
run()  { if [ "$DRY" -eq 1 ]; then printf '   [dry-run] %s\n' "$*"; else "$@"; fi; }
write_file() { if [ "$DRY" -eq 1 ]; then printf '   [dry-run] escribiría %s\n' "$1"; cat >/dev/null; else cat > "$1"; fi; }

while [ $# -gt 0 ]; do
  case "$1" in
    --domain)   DOMAIN="${2:-}"; shift 2 ;;
    --selector) SELECTOR="${2:-}"; shift 2 ;;
    --force)    FORCE=1; shift ;;
    --dry-run)  DRY=1; shift ;;
    -h|--help)  sed -n '2,14p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *)          die "Opción desconocida: $1" ;;
  esac
done

[ -n "$DOMAIN" ] || die "Indica el dominio:  bash deploy/setup-local-mail.sh --domain paragon.tudominio.com"
case "$DOMAIN" in *[!A-Za-z0-9.-]*|"") die "Dominio inválido: $DOMAIN" ;; esac
if [ "$DRY" -eq 0 ]; then
  [ "$(id -u)" -eq 0 ] || die "Ejecútalo como root."
  command -v apt-get >/dev/null || die "Necesita Debian/Ubuntu (apt-get)."
fi

KEYDIR="/etc/opendkim/keys/$DOMAIN"

# ---------- 1) Postfix ya instalado: no se pisa ----------
step "Servidor de correo de salida (Postfix)"
PRE_EXISTING=0
if [ "$DRY" -eq 0 ] && dpkg -s postfix >/dev/null 2>&1; then PRE_EXISTING=1; fi
if [ "$DRY" -eq 0 ] && [ "$PRE_EXISTING" -eq 0 ] && ss -ltn 2>/dev/null | awk '{print $4}' | grep -Eq '(^|:)25$'; then
  die "Ya hay otro programa escuchando en el puerto 25 (otro servidor de correo). No se instala Postfix encima."
fi
if [ "$PRE_EXISTING" -eq 1 ] && [ "$FORCE" -eq 0 ]; then
  warn "Postfix ya estaba instalado: NO se cambia su configuración (podría estar en uso por otra cosa)."
  warn "Puedes usarlo tal cual (PARAGON → 127.0.0.1 puerto 25) o repetir con --force para ajustarlo a este uso."
  exit 0
fi

# ---------- 2) paquetes ----------
export DEBIAN_FRONTEND=noninteractive
if [ "$DRY" -eq 0 ]; then
  echo "postfix postfix/main_mailer_type select Internet Site" | debconf-set-selections
  echo "postfix postfix/mailname string $DOMAIN" | debconf-set-selections
fi
run apt-get install -y --no-upgrade postfix opendkim opendkim-tools
info "Paquetes instalados"

# ---------- 3) Postfix: solo envío ----------
step "Configurando Postfix (solo envío, escucha únicamente en este equipo)"
if [ "$DRY" -eq 1 ]; then
  printf '   [dry-run] postconf -e myhostname=%s myorigin=%s mydestination=localhost inet_interfaces=loopback-only ...\n' "$DOMAIN" "$DOMAIN"
else
  postconf -e "myhostname = $DOMAIN"
  postconf -e "myorigin = $DOMAIN"
  postconf -e "mydestination = localhost"
  postconf -e "inet_interfaces = loopback-only"
  postconf -e "inet_protocols = ipv4"
  postconf -e "mynetworks = 127.0.0.0/8"
  postconf -e "relayhost ="
  postconf -e "smtp_tls_security_level = may"
  postconf -e "smtpd_tls_security_level = none"
  postconf -e "disable_vrfy_command = yes"
  postconf -e "milter_default_action = accept"
  postconf -e "milter_protocol = 6"
  postconf -e "smtpd_milters = inet:127.0.0.1:8891"
  postconf -e "non_smtpd_milters = inet:127.0.0.1:8891"
fi
info "Postfix: no recibe correo de internet, solo envía lo que le entrega PARAGON"

# ---------- 4) DKIM ----------
step "Firma DKIM (OpenDKIM)"
if [ "$DRY" -eq 0 ] && [ ! -f /etc/opendkim.conf.paragon-original ] && [ -f /etc/opendkim.conf ]; then
  cp /etc/opendkim.conf /etc/opendkim.conf.paragon-original
fi
run mkdir -p "$KEYDIR"
if [ "$DRY" -eq 1 ] || [ ! -f "$KEYDIR/$SELECTOR.private" ]; then
  run opendkim-genkey -b 2048 -d "$DOMAIN" -s "$SELECTOR" -D "$KEYDIR"
  info "Clave DKIM generada (selector «$SELECTOR»)"
else
  info "La clave DKIM ya existía: se conserva"
fi
run chown -R opendkim:opendkim /etc/opendkim
run chmod 600 "$KEYDIR/$SELECTOR.private"
write_file /etc/opendkim.conf <<EOF
# Generado por deploy/setup-local-mail.sh
Syslog          yes
UMask           007
Mode            s
Canonicalization relaxed/simple
Domain          $DOMAIN
Selector        $SELECTOR
KeyFile         $KEYDIR/$SELECTOR.private
Socket          inet:8891@127.0.0.1
PidFile         /run/opendkim/opendkim.pid
UserID          opendkim
EOF
run systemctl enable opendkim postfix
run systemctl restart opendkim
run systemctl restart postfix
info "OpenDKIM y Postfix en marcha"

# ---------- 5) qué falta fuera del servidor ----------
step "Lo que debes hacer FUERA del servidor (DNS) para que Gmail y Outlook confíen"
DKIM_VALUE=""
if [ "$DRY" -eq 0 ] && [ -f "$KEYDIR/$SELECTOR.txt" ]; then
  # el archivo viene partido en trozos entre comillas: se unen en un solo valor
  DKIM_VALUE="$(tr -d '\n\t' < "$KEYDIR/$SELECTOR.txt" | grep -o '"[^"]*"' | tr -d '"' | tr -d ' ' | tr -d '\n')"
  DKIM_VALUE="$(printf '%s' "$DKIM_VALUE" | sed 's/^v=DKIM1;/v=DKIM1; /; s/;k=rsa;/; k=rsa; /; s/;p=/; p=/')"
fi
IP="$(curl -fsS --max-time 8 https://api.ipify.org 2>/dev/null || echo 'IP_DEL_SERVIDOR')"
cat <<EOF

  ${B}1) Registro DKIM${N} — agrégalo en el DNS (Cloudflare → DNS → Add record):
       Tipo:    TXT
       Nombre:  ${SELECTOR}._domainkey
       Valor:   ${DKIM_VALUE:-(se genera al ejecutarlo; también está en $KEYDIR/$SELECTOR.txt)}
       (el valor es largo; Cloudflare lo acepta completo)

  ${B}2) DNS inverso (PTR)${N} — en el panel de tu proveedor de VPS, para la IP ${IP}:
       Reverse DNS / PTR  →  ${DOMAIN}
       Gmail y Outlook desconfían de las IPs cuyo PTR no coincide con el nombre del servidor.

  ${B}3) SPF${N} — tu dominio debe autorizar esta IP. Si tu registro SPF ya tiene "+a" y ${DOMAIN} apunta a este
       servidor, ya está autorizada. Si no, agrega  ip4:${IP}  a tu registro SPF (debe haber UN solo SPF).

  ${B}4) Reputación de la IP${N} — si la IP está en alguna lista negra (RBL), debes pedir el deslistado:
       https://lookup.abusix.com/search?q=${IP}
       Mientras esté listada, algunos destinos pueden rechazar o mandar a spam tus correos.

  ${B}5) Puerto 25 saliente${N} — algunos proveedores de VPS lo bloquean. Compruébalo con:
       timeout 8 bash -c 'echo > /dev/tcp/gmail-smtp-in.l.google.com/25' && echo "abierto" || echo "BLOQUEADO"

  Cuando termines, en la web: Configuración → Correo → «Enviar correo de prueba», y revisa el «Registro de envíos».
  Para ver qué pasó con cada mensaje después de salir:   journalctl -t postfix/smtp -f
  En Gmail, abre un correo recibido → ⋮ → «Mostrar original»: deben aparecer  SPF: PASS  y  DKIM: PASS.

EOF
