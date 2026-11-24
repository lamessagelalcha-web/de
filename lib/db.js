import { neon } from '@neondatabase/serverless';

let _sql;
export function getSql() {
  if (_sql) return _sql;
  const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
  if (!url) throw new Error('DATABASE_URL is not set');
  _sql = neon(url);
  return _sql;
}

let ready;
/* Creates the tables the first time any API route runs (safe to repeat). */
export function ensureSchema() {
  if (!ready) {
    const sql = getSql();
    ready = sql.transaction([
      sql`CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY, username TEXT NOT NULL, email TEXT NOT NULL, fullname TEXT NOT NULL,
        stream TEXT NOT NULL, password_hash TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now())`,
      sql`CREATE UNIQUE INDEX IF NOT EXISTS users_username_key ON users (lower(username))`,
      sql`CREATE UNIQUE INDEX IF NOT EXISTS users_email_key ON users (lower(email))`,
      sql`CREATE TABLE IF NOT EXISTS questions (
        id SERIAL PRIMARY KEY, subject TEXT NOT NULL, position INT NOT NULL, text TEXT NOT NULL,
        options JSONB NOT NULL, correct INT NOT NULL)`,
      sql`CREATE INDEX IF NOT EXISTS questions_subject_idx ON questions (subject, position)`,
      sql`CREATE TABLE IF NOT EXISTS exam_sessions (
        user_id INT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE, subject TEXT NOT NULL,
        questions JSONB NOT NULL, answers JSONB NOT NULL DEFAULT '{}', current_index INT NOT NULL DEFAULT 0,
        end_time TIMESTAMPTZ NOT NULL)`,
      sql`CREATE TABLE IF NOT EXISTS results (
        id SERIAL PRIMARY KEY, user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        subject TEXT NOT NULL, score INT NOT NULL, correct INT NOT NULL, total INT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now())`,
      sql`CREATE INDEX IF NOT EXISTS results_user_idx ON results (user_id)`
    ]).catch(e => { ready = null; throw e; });
  }
  return ready;
}
