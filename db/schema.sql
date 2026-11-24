-- Optional: the API creates these tables automatically on first request.
-- You can also run this file manually in the Neon / Vercel SQL editor.

CREATE TABLE IF NOT EXISTS users (
  id            SERIAL PRIMARY KEY,
  username      TEXT NOT NULL,
  email         TEXT NOT NULL,
  fullname      TEXT NOT NULL,
  stream        TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS users_username_key ON users (lower(username));
CREATE UNIQUE INDEX IF NOT EXISTS users_email_key    ON users (lower(email));

CREATE TABLE IF NOT EXISTS questions (
  id       SERIAL PRIMARY KEY,
  subject  TEXT  NOT NULL,
  position INT   NOT NULL,
  text     TEXT  NOT NULL,
  options  JSONB NOT NULL,
  correct  INT   NOT NULL
);
CREATE INDEX IF NOT EXISTS questions_subject_idx ON questions (subject, position);

-- one exam in progress per student (a snapshot of the questions, so admin changes don't affect it)
CREATE TABLE IF NOT EXISTS exam_sessions (
  user_id       INT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  subject       TEXT  NOT NULL,
  questions     JSONB NOT NULL,
  answers       JSONB NOT NULL DEFAULT '{}',
  current_index INT   NOT NULL DEFAULT 0,
  end_time      TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS results (
  id         SERIAL PRIMARY KEY,
  user_id    INT  NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  subject    TEXT NOT NULL,
  score      INT  NOT NULL,
  correct    INT  NOT NULL,
  total      INT  NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS results_user_idx ON results (user_id);
