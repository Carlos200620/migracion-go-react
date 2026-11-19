BEGIN;
CREATE TABLE IF NOT EXISTS user_sessions (
 token_hash varchar(64) PRIMARY KEY,
 user_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 expires_at timestamptz NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS user_sessions_expiry_idx ON user_sessions(expires_at);
CREATE INDEX IF NOT EXISTS user_sessions_user_idx ON user_sessions(user_id);
CREATE TABLE IF NOT EXISTS password_resets (
 token_hash varchar(64) PRIMARY KEY,
 user_id integer NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
 expires_at timestamptz NOT NULL,
 used_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS notifications (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 user_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 project_id integer,
 project_title varchar(200) NOT NULL,
 kind varchar(20) NOT NULL CHECK(kind IN ('approved','observed','withdraw','restore','delete')),
 message text NOT NULL,
 read_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS notifications_user_date_idx ON notifications(user_id,created_at DESC,id DESC);
CREATE INDEX IF NOT EXISTS notifications_unread_idx ON notifications(user_id) WHERE read_at IS NULL;
CREATE OR REPLACE FUNCTION rp_normalize(value text) RETURNS text
LANGUAGE sql IMMUTABLE PARALLEL SAFE STRICT AS $$
 SELECT translate(lower(value),'áéíóúüñàèìòùâêîôûäëïöÿç','aeiouunaeiouaeiouaeioyc')
$$;
CREATE INDEX IF NOT EXISTS projects_public_page_idx ON projects(published_at DESC,id DESC) WHERE status='approved';
CREATE INDEX IF NOT EXISTS projects_owner_status_idx ON projects(owner_id,status,updated_at DESC,id DESC);
CREATE INDEX IF NOT EXISTS projects_category_year_idx ON projects(category_id,year,status);
COMMIT;
