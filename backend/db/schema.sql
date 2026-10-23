-- Esquema inicial de PARAGON (PostgreSQL)

DO $$ BEGIN
  CREATE TYPE user_role AS ENUM ('admin', 'oficial', 'miembro');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE user_status AS ENUM ('pendiente', 'activo', 'inactivo', 'rechazado');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS users (
  id              SERIAL PRIMARY KEY,
  character_name  VARCHAR(40)  NOT NULL UNIQUE,
  email           VARCHAR(120) NOT NULL UNIQUE,
  password_hash   TEXT         NOT NULL,
  character_class VARCHAR(40),
  role            user_role    NOT NULL DEFAULT 'miembro',
  status          user_status  NOT NULL DEFAULT 'pendiente',
  created_at      TIMESTAMPTZ  NOT NULL DEFAULT now()
);

-- Antes solo se permitía un admin; ahora hay dos.
DROP INDEX IF EXISTS one_admin_only;

-- El usuario de login es el nombre del personaje (sin distinguir mayúsculas).
CREATE UNIQUE INDEX IF NOT EXISTS users_name_ci ON users (lower(character_name));

CREATE TABLE IF NOT EXISTS events (
  id         SERIAL PRIMARY KEY,
  name       VARCHAR(80) NOT NULL,
  tag        VARCHAR(30) NOT NULL,
  day        VARCHAR(40) NOT NULL,
  time       VARCHAR(30) NOT NULL,
  icon       VARCHAR(8),
  created_by INT REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS news (
  id         SERIAL PRIMARY KEY,
  title      VARCHAR(140) NOT NULL,
  body       TEXT NOT NULL,
  created_by INT REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Contraseña temporal: el usuario debe cambiarla en su primer ingreso.
ALTER TABLE users ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN NOT NULL DEFAULT false;

-- ---------- Control de invasiones ----------
-- Una temporada dura 1 a 4 semanas desde una fecha de inicio configurable (en la práctica 1 o 2).
CREATE TABLE IF NOT EXISTS seasons (
  id         SERIAL PRIMARY KEY,
  name       VARCHAR(60) NOT NULL,
  start_date DATE NOT NULL,
  weeks      SMALLINT NOT NULL CHECK (weeks BETWEEN 1 AND 4),
  created_by INT REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Una fila = el jugador asistió a esa invasión (día + horario).
CREATE TABLE IF NOT EXISTS invasion_attendance (
  season_id INT NOT NULL REFERENCES seasons(id) ON DELETE CASCADE,
  user_id   INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  day       DATE NOT NULL,
  slot      CHAR(5) NOT NULL,
  PRIMARY KEY (season_id, user_id, day, slot)
);

-- Botín obtenido por la guild en la temporada (categorías 0 a 7).
CREATE TABLE IF NOT EXISTS season_loot (
  id         SERIAL PRIMARY KEY,
  season_id  INT NOT NULL REFERENCES seasons(id) ON DELETE CASCADE,
  category   SMALLINT NOT NULL CHECK (category BETWEEN 0 AND 7),
  quantity   INT NOT NULL CHECK (quantity > 0),
  created_by INT REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Confirmación de entrega del reparto a cada jugador.
CREATE TABLE IF NOT EXISTS season_delivery (
  season_id    INT NOT NULL REFERENCES seasons(id) ON DELETE CASCADE,
  user_id      INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  delivered_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (season_id, user_id)
);

-- ---------- Marcación de asistencia por los miembros ----------
-- Configuración editable: checkin_minutes (duración de la ventana) y timezone.
CREATE TABLE IF NOT EXISTS settings (
  key   VARCHAR(40) PRIMARY KEY,
  value TEXT NOT NULL
);

-- Apertura o cierre manual de una invasión puntual, por encima del horario normal.
CREATE TABLE IF NOT EXISTS invasion_overrides (
  day   DATE NOT NULL,
  slot  CHAR(5) NOT NULL,
  state VARCHAR(6) NOT NULL CHECK (state IN ('open', 'closed')),
  PRIMARY KEY (day, slot)
);

-- ---------- Zona horaria del usuario y origen de cada asistencia ----------
-- NULL = usa la hora de Perú (zona del gremio). Solo cambia cómo se le muestran los horarios.
ALTER TABLE users ADD COLUMN IF NOT EXISTS timezone VARCHAR(60);

-- Quién registró la asistencia: el propio jugador ('self') o un oficial/admin ('staff').
ALTER TABLE invasion_attendance ADD COLUMN IF NOT EXISTS source VARCHAR(5) NOT NULL DEFAULT 'self' CHECK (source IN ('self', 'staff'));
ALTER TABLE invasion_attendance ADD COLUMN IF NOT EXISTS marked_by INT REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE invasion_attendance ADD COLUMN IF NOT EXISTS marked_at TIMESTAMPTZ NOT NULL DEFAULT now();

-- ---------- Botín por invasión (día + horario) ----------
-- Una fila = cantidad de una categoría obtenida en una invasión. Las filas sin día/horario son anteriores a este cambio.
ALTER TABLE season_loot ADD COLUMN IF NOT EXISTS day DATE;
ALTER TABLE season_loot ADD COLUMN IF NOT EXISTS slot CHAR(5);
ALTER TABLE season_loot ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();
CREATE UNIQUE INDEX IF NOT EXISTS season_loot_invasion_cat ON season_loot (season_id, day, slot, category) WHERE day IS NOT NULL;

-- ---------- Invitaciones ----------
-- invited_at: cuándo se enviaron los accesos. registered_at: cuándo cambió su clave temporal por primera vez.
-- "Invitación pendiente" = must_change_password = true; "Registrado" = ya cambió su clave.
ALTER TABLE users ADD COLUMN IF NOT EXISTS invited_at TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS registered_at TIMESTAMPTZ;
UPDATE users SET invited_at = created_at WHERE must_change_password AND invited_at IS NULL;

-- ---------- Salón de leyendas (ranking editable a mano) ----------
CREATE TABLE IF NOT EXISTS legends (
  id         SERIAL PRIMARY KEY,
  name       VARCHAR(40) NOT NULL,
  class_name VARCHAR(40) NOT NULL,
  level      INT NOT NULL CHECK (level >= 0),
  points     INT NOT NULL CHECK (points >= 0),
  role       VARCHAR(30) NOT NULL,
  created_by INT REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------- Recuperación de contraseña ----------
-- Se guarda solo el hash del token. El enlace vence y se usa una sola vez.
CREATE TABLE IF NOT EXISTS password_resets (
  id         SERIAL PRIMARY KEY,
  user_id    INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash CHAR(64) NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at    TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------- Registro de envíos de correo ----------
-- Solo destinatario, tipo, asunto, estado y detalle: nunca el contenido ni las contraseñas temporales.
CREATE TABLE IF NOT EXISTS mail_log (
  id         SERIAL PRIMARY KEY,
  to_email   VARCHAR(200) NOT NULL,
  kind       VARCHAR(20)  NOT NULL,
  subject    VARCHAR(200) NOT NULL,
  status     VARCHAR(10)  NOT NULL CHECK (status IN ('enviado', 'fallo', 'sin_smtp')),
  detail     TEXT,
  created_at TIMESTAMPTZ  NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS mail_log_created ON mail_log (created_at DESC);

-- ---------- Registro de asistencia por un oficial designado ----------
-- Solo los oficiales con este permiso (y el admin) anotan qué PJ asistió a cada invasión; los miembros ya no se marcan solos.
ALTER TABLE users ADD COLUMN IF NOT EXISTS records_attendance BOOLEAN NOT NULL DEFAULT false;

-- ---------- Períodos sin liga ----------
-- Las invasiones continúan fuera de la liga: un período 'libre' funciona igual que una temporada
-- (asistencia, botín y reparto de cajas), pero se identifica aparte.
ALTER TABLE seasons ADD COLUMN IF NOT EXISTS kind VARCHAR(5) NOT NULL DEFAULT 'liga' CHECK (kind IN ('liga', 'libre'));

-- ---------- Historial de la asistencia ----------
-- Cada marca o retiro hecho por un oficial. Los nombres se copian para que el rastro sobreviva si se borra un usuario.
CREATE TABLE IF NOT EXISTS attendance_log (
  id          SERIAL PRIMARY KEY,
  season_id   INT REFERENCES seasons(id) ON DELETE CASCADE,
  action      VARCHAR(6) NOT NULL CHECK (action IN ('marcar', 'quitar')),
  actor_id    INT REFERENCES users(id) ON DELETE SET NULL,
  actor_name  VARCHAR(40) NOT NULL,
  player_id   INT REFERENCES users(id) ON DELETE SET NULL,
  player_name VARCHAR(40) NOT NULL,
  day         DATE NOT NULL,
  slot        CHAR(5) NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS attendance_log_season ON attendance_log (season_id, created_at DESC);
