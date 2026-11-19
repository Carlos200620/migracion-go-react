BEGIN;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS withdrawal_reason text NOT NULL DEFAULT '';
ALTER TABLE projects DROP CONSTRAINT IF EXISTS projects_status_check;
ALTER TABLE projects ADD CONSTRAINT projects_status_check CHECK(status IN ('pending','observed','approved','withdrawn'));
CREATE TABLE IF NOT EXISTS project_events (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 project_id integer NOT NULL,
 project_title varchar(200) NOT NULL,
 actor_id integer REFERENCES users(id) ON DELETE SET NULL,
 actor_name varchar(150) NOT NULL,
 action varchar(20) NOT NULL CHECK(action IN ('withdraw','restore','delete')),
 previous_status varchar(20) NOT NULL,
 reason text NOT NULL CHECK(length(trim(reason)) BETWEEN 1 AND 1000),
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS project_events_project_idx ON project_events(project_id,created_at DESC);
-- No FK a projects: el registro de auditoría debe sobrevivir a la eliminación.
CREATE TABLE IF NOT EXISTS pending_file_deletions (
 storage_key text PRIMARY KEY,
 created_at timestamptz NOT NULL DEFAULT now()
);
COMMIT;
