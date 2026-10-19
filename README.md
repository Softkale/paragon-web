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
│   ├── scripts/           setup.js · create-admin.js · init-db.js
│   └── .env               Se crea solo (ver «Instalación automática»)
├── deploy/     nginx.conf · paragon.service · sync-nginx-port.sh · backup.sh
└── README.md   Esta guía
```

En producción **la web y la API salen de un solo proceso Node**. nginx recibe el tráfico y pone el HTTPS:

```
Internet ─► nginx (80/443) ─► Node (web compilada + API) ─► PostgreSQL
```

## Roles

| Rol | Puede |
|---|---|
| **Admin** | Todo: usuarios y roles, correo (SMTP), contenido, invasiones, reportes |
| **Oficial** | Crear/editar miembros, invasiones, botín, reportes de asistencia, contenido de la portada |
| **Miembro** | Marcar su asistencia, ver el reporte de cajas |

No hay registro público: las cuentas las crean los oficiales/admins (una a una o por carga masiva) y llegan por correo.

---

# Instalar en un servidor: UN SOLO COMANDO (Debian 12)

**Antes:** apunta el dominio al servidor (registro **A** con la IP del VPS, ej. `paragon.tudominio.com`) y sube el
proyecto al servidor, en cualquier carpeta que **no** esté dentro de `/root` (por ejemplo `/paragon-web`):

```bash
git clone URL_DEL_REPOSITORIO /paragon-web        # o cópialo con scp
```

**Luego, como root, un solo comando:**

```bash
cd /paragon-web
bash install.sh --domain paragon.tudominio.com --email tucorreo@dominio.com \
                --admin-name TuUsuario --admin-email tucorreo@dominio.com
```

Eso es todo. El instalador hace **sin preguntarte nada más**:

1. Instala los paquetes del sistema: nginx, PostgreSQL, certbot, ufw y Node.js 22.
2. Crea el usuario del servicio `paragon` (la app no corre como root).
3. Instala las dependencias y **compila la web**.
4. Crea el **`.env`** (con un `JWT_SECRET` aleatorio), el **usuario y la base de PostgreSQL** (con clave aleatoria),
   las **tablas**, los eventos iniciales y el **primer administrador** (sin necesitar correo).
5. Configura **nginx**, el **servicio systemd** (arranca solo con el servidor) y pide el **certificado HTTPS**.
6. Activa el **firewall** (SSH, 80 y 443), los **respaldos diarios** de la base y los **parches de seguridad** automáticos.

Al terminar muestra la dirección de la web y la **contraseña temporal del administrador** (anótala: al primer ingreso
se pide cambiarla).

| Opción | Para qué |
|---|---|
| `--domain` y `--email` | Dominio y correo para el certificado HTTPS. **Sin dominio** se instala solo por IP, con HTTP |
| `--admin-name` y `--admin-email` | Primer administrador. Si los omites y hay terminal, los pregunta |
| `--no-https` / `--no-firewall` | No pedir certificado / no tocar el firewall |
| `--update` | Hace `git pull` antes de instalar (para actualizar a una versión nueva) |
| `--dry-run` | Muestra lo que haría, sin ejecutar nada |

**Es seguro repetirlo:** no borra datos, no recrea lo que ya existe y no pisa la configuración de HTTPS de nginx.
Si el dominio aún no apunta al servidor, instala igual por HTTP y te dice el comando para pedir el certificado después.

**Actualizar a una versión nueva:**

```bash
cd /paragon-web
bash install.sh --update --domain paragon.tudominio.com --email tucorreo@dominio.com
```

Después, entra a la web como administrador y sigue los pasos del panel (ver «Paso 10 · Configurar la web desde el panel»
más abajo): correo, textos de la portada, primera temporada y miembros.

---

# Instalación automática (cómo funciona por dentro)

Casi todo se crea solo. Hay **dos capas**:

**1. Al arrancar el servidor** (`npm start` / `npm run dev`), automáticamente:
- Si falta `backend/.env`, lo **crea** con un `JWT_SECRET` aleatorio (y si le falta algo esencial, lo completa).
- **Crea la base de datos** si no existe y **crea o actualiza las tablas** (también carga los eventos iniciales una vez).
  Por eso, al actualizar a una versión nueva basta con reiniciar: las tablas se actualizan solas.
- Si el **puerto está ocupado**, usa el siguiente libre (ver «Puerto automático»).
- Si defines `ADMIN_NAME` y `ADMIN_EMAIL` y aún no hay ningún admin, **crea el primero** y muestra su clave temporal.

**2. `npm run setup`: el asistente que deja todo listo de una vez.** Además de lo anterior:
- Crea el **usuario y la base de PostgreSQL** (con una clave aleatoria) y escribe `DATABASE_URL` en el `.env`.
- Crea el **primer administrador**, sin necesidad de correo.

Para crear el usuario y la base de PostgreSQL el asistente necesita un administrador de PostgreSQL; lo obtiene así:

| Situación | Qué hace |
|---|---|
| En un servidor Linux, ejecutado como **root** con PostgreSQL local | Usa el usuario del sistema `postgres` (no pide clave) |
| En tu computador | Te pregunta la clave del usuario `postgres` (no se guarda en ningún archivo) |
| Sin preguntas | `npm run setup -- --yes --admin-url postgres://postgres:CLAVE@localhost:5432/postgres ...` |

Es **seguro repetirlo**: no borra nada, y si ya está todo configurado lo indica y no cambia nada.

Opciones sin preguntas (`--yes`): `--db-name --db-user --db-pass --host --port --admin-name --admin-email [--admin-password]`.
Con `--production` el `.env` nuevo sale con `NODE_ENV=production`, `HOST=127.0.0.1` y `TRUST_PROXY=1`.

---

# Parte 1 · Desarrollo local (Windows / Linux / Mac)

Requisitos: Node.js 20+ y PostgreSQL 14+ instalados y corriendo.

```bash
# Backend
cd backend
npm install
npm run setup          # crea .env, usuario y base de PostgreSQL, tablas y el primer admin (te hace unas preguntas)
npm run dev            # http://localhost:4000

# Frontend (otra terminal)
cd frontend
npm install
npm run dev            # http://localhost:5173  (pasa /api al backend, aunque éste use otro puerto)
```

> Arranca primero el backend. Si cambia de puerto, reinicia el servidor de la web.

---

# Parte 2 · Instalación MANUAL en Debian 12 (referencia)

> **No hace falta seguir esta parte**: `install.sh` (arriba) hace todo esto solo. Se conserva por si quieres entender o
> ajustar cada paso, o instalar a mano. Aquí las rutas usan `/opt/paragon`; ajústalas si instalaste en otra carpeta.

Todos los comandos se ejecutan **como `root`** (o antepón `sudo`). Reemplaza lo que está en MAYÚSCULAS:
`TU_DOMINIO`, `URL_DEL_REPOSITORIO`, etc.

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

**No hace falta crear nada en PostgreSQL a mano**: el asistente del Paso 6 crea el usuario y la base.

## Paso 4 · Usuario del sistema y código

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
chmod +x /opt/paragon/deploy/*.sh
```

> Si usas Git y el repositorio es privado, configura antes una *deploy key* o usa un token en la URL.

## Paso 5 · Instalar dependencias y compilar la web

```bash
su - paragon -c "cd /opt/paragon/frontend && npm ci && npm run build"     # genera frontend/dist
su - paragon -c "cd /opt/paragon/backend && npm ci --omit=dev"
```

## Paso 6 · Instalación automática: `.env`, base de datos, tablas y primer admin

Como **root**:

```bash
cd /opt/paragon/backend
npm run setup -- --production
```

El asistente, sin que tengas que escribir nada de PostgreSQL:

1. Crea `backend/.env` con `NODE_ENV=production`, `HOST=127.0.0.1`, `TRUST_PROXY=1` y un `JWT_SECRET` aleatorio.
2. Crea el usuario `paragon` y la base `paragon` en PostgreSQL con una **clave aleatoria** y la guarda en el `.env`.
3. Crea las tablas y los eventos iniciales.
4. Te pide el **usuario y el correo del primer administrador** y muestra su **contraseña temporal una sola vez**
   (anótala; al primer ingreso la web te obliga a cambiarla). No necesita correo configurado.

El `.env` queda a nombre del usuario `paragon` con permisos `600`.

Sin preguntas (útil para automatizar):

```bash
npm run setup -- --production --yes --admin-name TuUsuario --admin-email tucorreo@dominio.com
```

> Guarda el `JWT_SECRET` del `.env` en un lugar seguro: si lo cambias, se cierran todas las sesiones y hay que volver
> a escribir la contraseña del correo (SMTP) en el panel.

## Paso 7 · nginx (HTTP)

```bash
cp /opt/paragon/deploy/nginx.conf /etc/nginx/sites-available/paragon
nano /etc/nginx/sites-available/paragon                 # cambia paragon.tudominio.com por TU_DOMINIO
rm -f /etc/nginx/sites-enabled/default
ln -s /etc/nginx/sites-available/paragon /etc/nginx/sites-enabled/paragon
nginx -t && systemctl reload nginx
```

## Paso 8 · Dejarlo corriendo como servicio (systemd)

```bash
mkdir -p /opt/paragon/backend/outbox
chown paragon:paragon /opt/paragon/backend/outbox

cp /opt/paragon/deploy/paragon.service /etc/systemd/system/paragon.service
systemctl daemon-reload
systemctl enable --now paragon

systemctl status paragon                                   # debe decir "active (running)"
curl http://127.0.0.1:$(cat /opt/paragon/backend/.port)/api/health     # debe responder {"ok":true}
journalctl -u paragon -f                                   # ver los registros (Ctrl+C para salir)
```

Si no arranca, `journalctl -u paragon -n 50` dice el motivo.

## Paso 9 · HTTPS

```bash
certbot --nginx -d TU_DOMINIO --redirect -m tucorreo@dominio.com --agree-tos
```

Abre `https://TU_DOMINIO`: debe verse la portada. Entra en `/login` con el admin del Paso 6.

## Paso 10 · Configurar la web desde el panel

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
   que cambia su clave. Si el correo aún no está configurado, desmarca «Enviar accesos por correo» y copia la clave
   temporal que aparece en pantalla.

## Paso 11 · Respaldos automáticos

```bash
mkdir -p /var/backups/paragon && chown paragon:paragon /var/backups/paragon

# Programarlo todos los días a las 04:30 (lee la conexión del .env, no hay que configurar claves)
(crontab -u paragon -l 2>/dev/null; echo '30 4 * * * /opt/paragon/deploy/backup.sh') | crontab -u paragon -

# Probarlo ahora
su - paragon -c "/opt/paragon/deploy/backup.sh" && ls -lh /var/backups/paragon
```

Conserva los últimos 14 días. **Descarga copias fuera del servidor** de vez en cuando
(`scp root@IP:/var/backups/paragon/paragon-AAAA-MM-DD.dump .`).

Restaurar en una base vacía (la conexión está en `DATABASE_URL` del `.env`):
`pg_restore -d "URL_DE_LA_BASE" --clean --if-exists ARCHIVO.dump`

---

# Parte 3 · Operación diaria

## Puerto automático

El servidor intenta usar el puerto `PORT` (por defecto **4000**). Si está ocupado, **prueba con el siguiente libre**
(4001, 4002…) y anota el que eligió en `backend/.port`:

- **Desarrollo:** el servidor de la web (Vite) lee ese archivo al arrancar y apunta solo al puerto correcto.
- **Servidor:** `paragon.service` ejecuta `deploy/sync-nginx-port.sh` después de arrancar; si el puerto cambió,
  actualiza el `proxy_pass` de nginx y lo recarga. No tienes que hacer nada.
- Ver el puerto actual: `cat /opt/paragon/backend/.port`.
- Si prefieres que falle en vez de buscar otro, pon `PORT_STRICT=true` en el `.env`.

## Actualizar a una versión nueva

```bash
cd /ruta/del/proyecto
bash install.sh --update --domain TU_DOMINIO --email TU_CORREO
```

Hace `git pull`, recompila la web, reinicia el servicio y las tablas se actualizan solas. Haz un respaldo antes si quieres:
`su - paragon -c /ruta/del/proyecto/deploy/backup.sh`.

## Comandos útiles

| Qué | Comando |
|---|---|
| Estado del servicio | `systemctl status paragon` |
| Reiniciar | `systemctl restart paragon` |
| Ver registros en vivo | `journalctl -u paragon -f` |
| Comprobar que responde | `curl http://127.0.0.1:$(cat /opt/paragon/backend/.port)/api/health` |
| Recargar nginx | `nginx -t && systemctl reload nginx` |
| Renovación del certificado (prueba) | `certbot renew --dry-run` |
| Crear/restablecer un admin | `cd /opt/paragon/backend && su paragon -c "npm run admin:create -- --name X --email Y --reset"` |
| Repetir la instalación (seguro) | `cd /opt/paragon/backend && npm run setup -- --production` |

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
| El servicio se reinicia solo | Mira el motivo en `journalctl -u paragon -n 50` (casi siempre la conexión a la base) |
| `No se pudo conectar a PostgreSQL (28P01)` | La clave de `DATABASE_URL` no coincide. Ejecuta `npm run setup -- --production` como root: la ajusta |
| «El usuario … no tiene permiso para crear bases» | Ejecuta `npm run setup` (crea la base con un administrador de PostgreSQL) |
| Aviso «El puerto 4000 estaba ocupado» | Normal: usa otro puerto y nginx se ajusta solo. Ver `cat backend/.port` |
| Los correos no llegan | Usa «Enviar correo de prueba» en Configuración; el mensaje indica qué corregir. Revisa spam |
| Los enlaces de los correos van a `localhost` | Falta la dirección pública en **Configuración → Correo** |
| Todos aparecen con la misma IP / bloqueos raros | Falta `TRUST_PROXY=1` en el `.env` |
| La portada sale en blanco tras actualizar | No se compiló la web: `cd frontend && npm run build` y reiniciar |
| Las horas de invasión están corridas | Revisa la zona horaria en **Invasiones** (debe ser `America/Lima`) |

---

# Referencia

## Variables de entorno (`backend/.env`)

El `.env` se genera solo; estas son las variables que puede contener:

| Variable | Para qué |
|---|---|
| `DATABASE_URL` | Conexión a PostgreSQL (la escribe el asistente) |
| `JWT_SECRET` | Firma de sesiones y cifrado de secretos (se genera solo; ≥ 32 caracteres en producción) |
| `NODE_ENV=production` | Activa HSTS, CORS cerrado y la exigencia del `JWT_SECRET` fuerte |
| `HOST`, `PORT` | Dónde escucha (`127.0.0.1` y `4000` por defecto; si el puerto está ocupado usa otro) |
| `PORT_STRICT=true` | No buscar otro puerto: fallar si el indicado está ocupado |
| `TRUST_PROXY=1` | Obligatoria detrás de nginx para ver la IP real de cada visitante |
| `AUTO_INIT=false` | No crear la base/tablas al arrancar (por defecto sí se crean) |
| `ADMIN_NAME`, `ADMIN_EMAIL`, `ADMIN_PASSWORD` | Si no hay ningún admin, se crea el primero al arrancar (`ADMIN_PASSWORD` es opcional) |
| `PG_ADMIN_URL` | Solo para crear el usuario/base de PostgreSQL desde el arranque; **no la dejes guardada** |
| `FRONTEND_DIST` | Ruta de la web compilada, si no está en `../frontend/dist` |
| `CORS_ORIGIN` | Solo si sirves la web desde otro dominio |
| `APP_URL`, `SMTP_*` | Opcionales: se configuran desde el panel; aquí solo si quieres dejarlos fijos |

## Seguridad que ya incluye

- HTTPS (nginx + certbot), cabeceras de seguridad (helmet) y política de contenido restrictiva.
- Contraseñas con bcrypt. La contraseña del SMTP se guarda **cifrada** y nunca se vuelve a mostrar.
- El `.env` se crea con permisos `600`; la conexión de administrador de PostgreSQL **nunca se guarda**.
- Los permisos de cada usuario se comprueban en la base de datos en **cada petición**: quitar un rol o desactivar
  una cuenta surte efecto al instante.
- Bloqueo tras 8 intentos fallidos de ingreso (por IP y usuario) y límite en la recuperación de contraseña.
- Recuperación de contraseña por enlace de un solo uso que vence en 1 hora.
- La API solo escucha en `127.0.0.1`; desde internet únicamente se llega por nginx.

## Endurecimiento opcional

- `apt install fail2ban` protege SSH contra intentos de fuerza bruta.
- Cambia el puerto SSH o limita el acceso por IP en el firewall si tienes IP fija.
