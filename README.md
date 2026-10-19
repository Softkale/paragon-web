# PARAGON · Guild de Smash MU

Web de la guild: portada pública, control de invasiones (asistencia que marcan los propios miembros, botín y
reparto de cajas), reportes, gestión de miembros y panel de administración.

- **Frontend:** React 17 + Vite
- **Backend:** Node.js + Express
- **Base de datos:** PostgreSQL

```
webparagon/
├── frontend/   Web (React). Se compila a frontend/dist
├── backend/    API + servidor de la web compilada
│   ├── db/schema.sql      Tablas
│   ├── scripts/           init-db.js · create-admin.js
│   └── .env(.production).example
├── deploy/     nginx.conf · paragon.service · backup.sh
└── README.md   Esta guía
```

En producción **la web y la API salen de un solo proceso Node** (`127.0.0.1:4000`). nginx recibe el tráfico y pone
el HTTPS:

```
Internet ─► nginx (80/443) ─► Node :4000 (web compilada + API) ─► PostgreSQL
```

---

## Roles

| Rol | Puede |
|---|---|
| **Admin** | Todo: usuarios y roles, correo (SMTP), contenido, invasiones, reportes |
| **Oficial** | Crear/editar miembros, invasiones, botín, reportes de asistencia, contenido de la portada |
| **Miembro** | Marcar su asistencia, ver el reporte de cajas |

No hay registro público: las cuentas las crean los oficiales/admins (una a una o por carga masiva) y llegan por correo.

---

# Parte 1 · Desarrollo local (Windows / Linux / Mac)

Requisitos: Node.js 20+ y PostgreSQL 14+.

```bash
# 1) Base de datos: crea una vacía llamada "paragon"

# 2) Backend
cd backend
npm install
cp .env.example .env          # edita DATABASE_URL y JWT_SECRET
npm run db:init               # crea las tablas y los eventos iniciales
npm run admin:create -- --name TuUsuario --email tucorreo@dominio.com
npm run dev                   # http://localhost:4000

# 3) Frontend (otra terminal)
cd frontend
npm install
npm run dev                   # http://localhost:5173  (pasa /api al backend)
```

---

# Parte 2 · Despliegue en un VPS con Debian 12

Todos los comandos se ejecutan **como `root`** (o antepón `sudo`). Reemplaza lo que está en MAYÚSCULAS:
`TU_DOMINIO`, `CLAVE_DE_LA_BASE`, `URL_DEL_REPOSITORIO`, etc.

**Antes de empezar necesitas:**
- Un VPS con Debian 12 (1 GB de RAM alcanza) y acceso SSH.
- Un dominio con un registro **A** apuntando a la IP del VPS (ej. `paragon.tudominio.com`).
- El código en un repositorio Git privado (recomendado) o la posibilidad de copiarlo con `scp`.

## Paso 1 · Actualizar el sistema y entrar con seguridad

```bash
apt update && apt upgrade -y
apt install -y sudo curl git ca-certificates gnupg ufw unattended-upgrades
dpkg-reconfigure -plow unattended-upgrades        # actualizaciones de seguridad automáticas (elige "Sí")
```

Recomendado: entra por SSH con **llave** y desactiva la contraseña de root
(`/etc/ssh/sshd_config` → `PermitRootLogin prohibit-password` y `PasswordAuthentication no`, luego
`systemctl restart ssh`). Haz esto **solo después** de confirmar que tu llave funciona.

## Paso 2 · Firewall

```bash
ufw allow 22/tcp            # SSH (si usas otro puerto, cámbialo ANTES de activar el firewall)
ufw allow 80,443/tcp        # web y HTTPS
ufw enable
ufw status
```

> Importante: permite SSH antes de `ufw enable`, o te quedarás sin acceso al servidor.

## Paso 3 · Instalar Node.js 22, PostgreSQL y nginx

Debian 12 trae Node 18 en sus repositorios, que es antiguo; se instala Node 22 (LTS) desde NodeSource:

```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
apt install -y nodejs postgresql nginx certbot python3-certbot-nginx

node -v          # debe mostrar v22.x
psql --version   # PostgreSQL 15
```

## Paso 4 · Crear la base de datos

```bash
su - postgres -c "psql" <<'SQL'
CREATE USER paragon WITH PASSWORD 'CLAVE_DE_LA_BASE';
CREATE DATABASE paragon OWNER paragon ENCODING 'UTF8';
SQL
```

Elige una clave larga. Si contiene símbolos (`@ : / # $ %`), en el `.env` tendrás que codificarlos
(por ejemplo `@` → `%40`); lo más simple es usar solo letras y números.

Prueba la conexión: `psql "postgres://paragon:CLAVE_DE_LA_BASE@localhost:5432/paragon" -c "select 1"`

## Paso 5 · Usuario del sistema y código

```bash
# Usuario sin privilegios que ejecutará la aplicación
adduser --system --group --home /opt/paragon --shell /bin/bash paragon

# Opción A (recomendada): repositorio Git
git clone URL_DEL_REPOSITORIO /opt/paragon

# Opción B: copiar desde tu computador (desde TU máquina, sin node_modules)
#   tar --exclude=node_modules --exclude=dist --exclude=.env -czf paragon.tar.gz webparagon
#   scp paragon.tar.gz root@IP_DEL_VPS:/tmp/
#   (en el VPS)  mkdir -p /opt/paragon && tar -xzf /tmp/paragon.tar.gz -C /opt/paragon --strip-components=1

chown -R paragon:paragon /opt/paragon
```

> Si usas Git y el repositorio es privado, configura antes una *deploy key* o usa un token en la URL.

## Paso 6 · Configurar el backend (`.env`)

```bash
su - paragon
cd /opt/paragon/backend
cp .env.production.example .env
openssl rand -hex 48          # copia el resultado: será el JWT_SECRET
nano .env
```

Completa **al menos** estas líneas del `.env`:

```ini
NODE_ENV=production
PORT=4000
HOST=127.0.0.1
TRUST_PROXY=1
DATABASE_URL=postgres://paragon:CLAVE_DE_LA_BASE@localhost:5432/paragon
JWT_SECRET=PEGA_AQUI_EL_VALOR_DE_openssl
```

Protege el archivo: `chmod 600 .env`.

> El servidor **se niega a arrancar** en producción si `JWT_SECRET` tiene menos de 32 caracteres.
> Guarda ese valor en un lugar seguro: si lo cambias, se cierran todas las sesiones y hay que volver a escribir la
> contraseña del correo (SMTP) en el panel.

## Paso 7 · Compilar la web y crear las tablas

Todavía como usuario `paragon`:

```bash
cd /opt/paragon/frontend
npm ci
npm run build                 # genera frontend/dist

cd /opt/paragon/backend
npm ci --omit=dev
npm run db:init               # crea las tablas y carga los eventos iniciales (es seguro repetirlo)
```

## Paso 8 · Crear el primer administrador (sin correo)

```bash
npm run admin:create -- --name TuUsuario --email tucorreo@dominio.com
```

Muestra una **contraseña temporal una sola vez**: anótala. Al primer ingreso la web te obligará a cambiarla.
No hace falta tener el correo configurado.

Para crear más admins, repite el comando o hazlo luego desde el panel
(*Miembros → + Nuevo miembro → rol admin*, desmarcando «Enviar accesos por correo»).

Vuelve a `root` con `exit`.

## Paso 9 · Dejarlo corriendo como servicio (systemd)

```bash
mkdir -p /opt/paragon/backend/outbox
chown paragon:paragon /opt/paragon/backend/outbox

cp /opt/paragon/deploy/paragon.service /etc/systemd/system/paragon.service
systemctl daemon-reload
systemctl enable --now paragon

systemctl status paragon                   # debe decir "active (running)"
curl http://127.0.0.1:4000/api/health      # debe responder {"ok":true}
journalctl -u paragon -f                   # ver los registros (Ctrl+C para salir)
```

Si no arranca, `journalctl -u paragon -n 50` dice el motivo (casi siempre el `.env` o la conexión a la base).

## Paso 10 · nginx y HTTPS

```bash
cp /opt/paragon/deploy/nginx.conf /etc/nginx/sites-available/paragon
nano /etc/nginx/sites-available/paragon                 # cambia paragon.tudominio.com por TU_DOMINIO
rm -f /etc/nginx/sites-enabled/default
ln -s /etc/nginx/sites-available/paragon /etc/nginx/sites-enabled/paragon
nginx -t && systemctl reload nginx

# Certificado HTTPS gratuito (se renueva solo)
certbot --nginx -d TU_DOMINIO --redirect -m tucorreo@dominio.com --agree-tos
```

Abre `https://TU_DOMINIO` en el navegador: debe verse la portada. Entra en `/login` con el admin del Paso 8.

## Paso 11 · Configurar la web desde el panel

Entra como admin y revisa, en este orden:

1. **Configuración → Correo (SMTP):** servidor, puerto, usuario, contraseña, remitente y, sobre todo, la
   **dirección pública de la web** (`https://TU_DOMINIO`), que va en los botones de los correos.
   Pulsa **«Enviar correo de prueba»** hasta que llegue.
   - Gmail: necesita una «contraseña de aplicación» (requiere verificación en dos pasos).
2. **Contenido → Textos y cifras:** textos de la portada y el **enlace del botón de contacto** (Discord, WhatsApp…).
   Si lo dejas vacío, el botón de contacto no se muestra.
3. **Contenido → Eventos / Noticias / Salón de leyendas:** edita Castle Siege, etc.
4. **Invasiones:** crea la **primera temporada** (nombre, fecha de inicio, 1 o 2 semanas) y revisa
   *minutos para marcar* (30) y la *zona horaria* (`America/Lima`).
   El reloj del servidor no importa: la hora se calcula con esa zona horaria.
5. **Miembros:** crea a los miembros (uno a uno o con **Carga masiva** pegando/subiendo un CSV
   `usuario;correo;clase;rol`). Cada uno recibe sus accesos por correo y queda como «Invitación pendiente» hasta
   que cambia su clave.

## Paso 12 · Respaldos automáticos

```bash
# Permite a "paragon" conectarse a la base sin pedir clave
su - paragon -c "echo 'localhost:5432:paragon:paragon:CLAVE_DE_LA_BASE' > ~/.pgpass && chmod 600 ~/.pgpass"

mkdir -p /var/backups/paragon && chown paragon:paragon /var/backups/paragon
chmod +x /opt/paragon/deploy/backup.sh

# Programarlo todos los días a las 04:30
(crontab -u paragon -l 2>/dev/null; echo '30 4 * * * /opt/paragon/deploy/backup.sh') | crontab -u paragon -

# Probarlo ahora
su - paragon -c "/opt/paragon/deploy/backup.sh" && ls -lh /var/backups/paragon
```

Conserva los últimos 14 días. **Descarga copias fuera del servidor** de vez en cuando
(`scp root@IP:/var/backups/paragon/paragon-AAAA-MM-DD.dump .`).

Restaurar en una base vacía:
`pg_restore -h localhost -U paragon -d paragon --clean --if-exists ARCHIVO.dump`

---

# Parte 3 · Operación diaria

## Actualizar a una versión nueva

```bash
cd /opt/paragon
su - paragon -c "cd /opt/paragon && git pull"
su - paragon -c "cd /opt/paragon/frontend && npm ci && npm run build"
su - paragon -c "cd /opt/paragon/backend && npm ci --omit=dev && npm run db:init"   # seguro de repetir
systemctl restart paragon
```

Haz un respaldo antes de actualizar: `su - paragon -c /opt/paragon/deploy/backup.sh`.

## Comandos útiles

| Qué | Comando |
|---|---|
| Estado del servicio | `systemctl status paragon` |
| Reiniciar | `systemctl restart paragon` |
| Ver registros en vivo | `journalctl -u paragon -f` |
| Comprobar que responde | `curl http://127.0.0.1:4000/api/health` |
| Recargar nginx | `nginx -t && systemctl reload nginx` |
| Renovación del certificado (prueba) | `certbot renew --dry-run` |
| Crear/restablecer un admin | `cd /opt/paragon/backend && su paragon -c "npm run admin:create -- --name X --email Y --reset"` |

## Si nadie puede entrar

Con acceso SSH al servidor se puede restablecer a un administrador (no necesita correo):

```bash
cd /opt/paragon/backend
su paragon -c "npm run admin:create -- --name TuUsuario --email tucorreo@dominio.com --reset"
```

Deja la cuenta como admin **activo** con una clave temporal nueva.

## Problemas frecuentes

| Síntoma | Causa y solución |
|---|---|
| `502 Bad Gateway` en el navegador | El servicio no corre: `systemctl status paragon` y `journalctl -u paragon -n 50` |
| El servicio se reinicia solo | Error en `.env` (falta `DATABASE_URL` / `JWT_SECRET` < 32 caracteres) o la base no responde |
| `password authentication failed` | La clave de `DATABASE_URL` no coincide con la del usuario `paragon` de PostgreSQL |
| Los correos no llegan | Usa «Enviar correo de prueba» en Configuración; el mensaje indica qué corregir. Revisa spam |
| Los enlaces de los correos van a `localhost` | Falta la dirección pública en **Configuración → Correo** |
| Todos aparecen con la misma IP / bloqueos raros | Falta `TRUST_PROXY=1` en el `.env` |
| La portada sale en blanco tras actualizar | No se compiló la web: `cd frontend && npm run build` y reiniciar |
| Las horas de invasión están corridas | Revisa la zona horaria en **Invasiones** (debe ser `America/Lima`) |

---

# Referencia

## Variables de entorno (`backend/.env`)

| Variable | Para qué |
|---|---|
| `DATABASE_URL` | Conexión a PostgreSQL (**obligatoria**) |
| `JWT_SECRET` | Firma de sesiones y cifrado de secretos (**obligatoria**; ≥ 32 caracteres en producción) |
| `NODE_ENV=production` | Activa HSTS, CORS cerrado y la exigencia del `JWT_SECRET` fuerte |
| `HOST`, `PORT` | Dónde escucha (`127.0.0.1` y `4000` detrás de nginx) |
| `TRUST_PROXY=1` | Obligatoria detrás de nginx para ver la IP real de cada visitante |
| `FRONTEND_DIST` | Ruta de la web compilada, si no está en `../frontend/dist` |
| `CORS_ORIGIN` | Solo si sirves la web desde otro dominio |
| `APP_URL`, `SMTP_*` | Opcionales: se configuran desde el panel; aquí solo si quieres dejarlos fijos |

## Seguridad que ya incluye

- HTTPS (nginx + certbot), cabeceras de seguridad (helmet) y política de contenido restrictiva.
- Contraseñas con bcrypt. La contraseña del SMTP se guarda **cifrada** y nunca se vuelve a mostrar.
- Los permisos de cada usuario se comprueban en la base de datos en **cada petición**: quitar un rol o desactivar
  una cuenta surte efecto al instante.
- Bloqueo tras 8 intentos fallidos de ingreso (por IP y usuario) y límite en la recuperación de contraseña.
- Recuperación de contraseña por enlace de un solo uso que vence en 1 hora.
- La API solo escucha en `127.0.0.1`; desde internet únicamente se llega por nginx.

## Endurecimiento opcional

- `apt install fail2ban` protege SSH contra intentos de fuerza bruta.
- Cambia el puerto SSH o limita el acceso por IP en el firewall si tienes IP fija.
- Programa reinicios solo cuando haya actualizaciones del kernel (`needrestart`).
