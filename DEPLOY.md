# Despliegue de PARAGON en un VPS

Guía para Ubuntu 22.04/24.04 (sirve igual en Debian). La web y la API salen de **un solo proceso Node**
que escucha en `127.0.0.1:4000`; **nginx** recibe el tráfico y pone el HTTPS; los datos viven en **PostgreSQL**.

```
Internet ─► nginx (80/443, HTTPS) ─► Node :4000 (web compilada + API) ─► PostgreSQL
```

## 0. Qué necesitas
- Un VPS con 1 GB de RAM es suficiente, y un dominio apuntando a su IP (registro A).
- Node.js 20 o 22 (LTS), PostgreSQL 14+, nginx y git.

## 1. Preparar el servidor
```bash
sudo apt update && sudo apt install -y nginx postgresql git curl ufw certbot python3-certbot-nginx
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash - && sudo apt install -y nodejs

# Firewall: solo SSH y web
sudo ufw allow OpenSSH && sudo ufw allow 'Nginx Full' && sudo ufw enable

# Usuario sin privilegios que ejecutará la app
sudo adduser --system --group --home /opt/paragon paragon
```

## 2. Base de datos
```bash
sudo -u postgres psql <<'SQL'
CREATE USER paragon WITH PASSWORD 'CAMBIA_ESTA_CLAVE';
CREATE DATABASE paragon OWNER paragon ENCODING 'UTF8';
SQL
```

## 3. Código y configuración
```bash
sudo git clone <URL-DE-TU-REPOSITORIO> /opt/paragon      # o sube la carpeta por scp/rsync
sudo chown -R paragon: /opt/paragon
sudo -u paragon -s
cd /opt/paragon/backend && cp .env.production.example .env && nano .env
```
En `.env` completa `DATABASE_URL` y `JWT_SECRET` (genéralo con `openssl rand -hex 48`). El servidor **no arranca en
producción** si el `JWT_SECRET` tiene menos de 32 caracteres.

## 4. Compilar la web y crear las tablas
```bash
cd /opt/paragon/frontend && npm ci && npm run build      # genera frontend/dist
cd /opt/paragon/backend  && npm ci --omit=dev
npm run db:init                                           # crea las tablas y los eventos iniciales
```

## 5. Crear el primer administrador (sin correo)
```bash
npm run admin:create -- --name TuUsuario --email tucorreo@dominio.com
```
Muestra una **contraseña temporal una sola vez**; al primer ingreso la web pedirá cambiarla. No necesita SMTP.
Para crear más admins repite el comando, o hazlo después desde el panel (Miembros → Nuevo miembro → rol admin,
desmarcando «Enviar accesos por correo»).

> ¿Nadie puede entrar? Con acceso al servidor: `npm run admin:create -- --name TuUsuario --email tucorreo@dominio.com --reset`
> restablece su clave y lo deja como admin activo.

## 6. Dejarlo corriendo (systemd)
```bash
sudo mkdir -p /opt/paragon/backend/outbox && sudo chown paragon: /opt/paragon/backend/outbox
sudo cp /opt/paragon/deploy/paragon.service /etc/systemd/system/
sudo systemctl daemon-reload && sudo systemctl enable --now paragon
sudo systemctl status paragon           # logs: journalctl -u paragon -f
curl http://127.0.0.1:4000/api/health   # debe responder {"ok":true}
```

## 7. nginx y HTTPS
```bash
sudo cp /opt/paragon/deploy/nginx.conf /etc/nginx/sites-available/paragon
sudo nano /etc/nginx/sites-available/paragon            # cambia el dominio
sudo ln -s /etc/nginx/sites-available/paragon /etc/nginx/sites-enabled/ && sudo nginx -t && sudo systemctl reload nginx
sudo certbot --nginx -d paragon.tudominio.com            # HTTPS gratis; se renueva solo
```

## 8. Configurar desde la web
Entra con el admin → **Configuración**:
1. **Correo (SMTP)**: servidor, usuario, contraseña, remitente y la **dirección pública de la web**
   (`https://paragon.tudominio.com`, va en los correos). Usa «Enviar correo de prueba».
2. **Contenido**: textos de la portada, eventos, noticias, salón de leyendas y el enlace del botón de contacto.
3. **Invasiones**: crea la primera temporada y revisa los minutos para marcar (por defecto 30) y la zona
   horaria (por defecto `America/Lima`; el reloj del servidor no importa, la hora se calcula con esa zona).

## 9. Respaldos
```bash
sudo -u paragon bash -c 'echo "localhost:5432:paragon:paragon:LA_CLAVE" > ~/.pgpass && chmod 600 ~/.pgpass'
sudo mkdir -p /var/backups/paragon && sudo chown paragon: /var/backups/paragon
sudo chmod +x /opt/paragon/deploy/backup.sh
sudo -u paragon crontab -e        # agrega:  30 4 * * * /opt/paragon/deploy/backup.sh
```
Guarda también copias **fuera del servidor** (descarga los `.dump` de vez en cuando).

## 10. Actualizar a una versión nueva
```bash
cd /opt/paragon && sudo -u paragon git pull
cd frontend && sudo -u paragon npm ci && sudo -u paragon npm run build
cd ../backend && sudo -u paragon npm ci --omit=dev && sudo -u paragon npm run db:init   # es seguro repetirlo
sudo systemctl restart paragon
```

## Seguridad: lo que ya trae
- HTTPS (nginx + certbot), cabeceras de seguridad (helmet) y política de contenido restrictiva.
- Contraseñas con bcrypt; la contraseña del SMTP se guarda **cifrada** y nunca se muestra.
- El rol y el estado de cada usuario se verifican en la base en **cada petición** (quitar un permiso es inmediato).
- Bloqueo tras 8 intentos fallidos de ingreso (por IP y usuario) y límite en la recuperación de contraseña.
- La API solo escucha en `127.0.0.1`; desde internet solo se llega por nginx.

## Variables de entorno
| Variable | Para qué |
|---|---|
| `DATABASE_URL` | Conexión a PostgreSQL (obligatoria) |
| `JWT_SECRET` | Firma de sesiones y cifrado de secretos (obligatoria, ≥ 32 caracteres en producción) |
| `NODE_ENV=production` | Activa HSTS, CORS cerrado y la exigencia del `JWT_SECRET` fuerte |
| `HOST`, `PORT` | Dirección y puerto del servidor (`127.0.0.1` y `4000`) |
| `TRUST_PROXY=1` | Obligatorio detrás de nginx para ver la IP real |
| `FRONTEND_DIST` | Ruta de la web compilada, si no está en `../frontend/dist` |
| `CORS_ORIGIN` | Solo si sirves la web desde otro dominio |

## Si algo falla
- `journalctl -u paragon -n 100` muestra el motivo (casi siempre `.env` o la conexión a la base).
- 502 en el navegador: el servicio no está corriendo (`systemctl status paragon`).
- Los enlaces de los correos apuntan a `localhost`: falta la dirección pública en **Configuración → Correo**.
- Los correos no salen: usa «Enviar correo de prueba»; el mensaje de error indica qué corregir.
