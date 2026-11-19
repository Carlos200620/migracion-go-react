BEGIN;
CREATE TABLE IF NOT EXISTS users (
 id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 full_name varchar(150) NOT NULL,
 email varchar(254) NOT NULL,
 password_hash text NOT NULL,
 role varchar(20) NOT NULL DEFAULT 'student' CHECK (role IN ('student','admin')),
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS users_email_unique ON users (lower(email));
CREATE TABLE IF NOT EXISTS categories (
 id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 name varchar(100) NOT NULL UNIQUE,
 description text NOT NULL DEFAULT '',
 active boolean NOT NULL DEFAULT true
);
CREATE TABLE IF NOT EXISTS projects (
 id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 owner_id integer NOT NULL REFERENCES users(id),
 category_id integer NOT NULL REFERENCES categories(id),
 title varchar(200) NOT NULL,
 summary text NOT NULL,
 objectives text NOT NULL,
 authors varchar(500) NOT NULL,
 year integer NOT NULL CHECK (year BETWEEN 1900 AND 2100),
 status varchar(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','observed','approved')),
 observations text NOT NULL DEFAULT '',
 reviewed_by integer REFERENCES users(id),
 published_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 CHECK (status <> 'approved' OR (reviewed_by IS NOT NULL AND published_at IS NOT NULL)),
 CHECK (status <> 'observed' OR length(trim(observations)) > 0)
);
CREATE INDEX IF NOT EXISTS projects_status_idx ON projects(status);
CREATE TABLE IF NOT EXISTS documents (
 id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 project_id integer NOT NULL UNIQUE REFERENCES projects(id) ON DELETE CASCADE,
 original_name varchar(255) NOT NULL,
 storage_key text NOT NULL UNIQUE,
 mime_type varchar(100) NOT NULL CHECK (mime_type = 'application/pdf'),
 size_bytes integer NOT NULL CHECK (size_bytes > 0 AND size_bytes <= 10485760),
 created_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO categories (name, description) VALUES
 ('Software', 'Desarrollo de sistemas y aplicaciones'),
 ('Innovación', 'Soluciones innovadoras a problemas concretos'),
 ('Educación', 'Proyectos de enseñanza y aprendizaje')
ON CONFLICT (name) DO NOTHING;
COMMIT;
