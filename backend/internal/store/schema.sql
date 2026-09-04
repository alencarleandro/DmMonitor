CREATE TABLE IF NOT EXISTS users (
  id text PRIMARY KEY,
  google_sub text UNIQUE NOT NULL,
  email text UNIQUE NOT NULL,
  name text NOT NULL,
  role text NOT NULL CHECK (role IN ('user', 'companion')),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS measurements (
  id text PRIMARY KEY,
  owner_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  value integer NOT NULL CHECK (value BETWEEN 1 AND 1500),
  measured_at timestamptz NOT NULL,
  context text NOT NULL CHECK (context IN ('fasting', 'before_meal', 'after_meal', 'bedtime', 'other')),
  notes text NOT NULL DEFAULT '' CHECK (length(notes) <= 1000),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS measurements_owner_date ON measurements(owner_id, measured_at DESC);
CREATE TABLE IF NOT EXISTS access_grants (
  id text PRIMARY KEY,
  owner_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  email text NOT NULL,
  companion_id text REFERENCES users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(owner_id, email),
  CHECK (owner_id IS DISTINCT FROM companion_id)
);
CREATE INDEX IF NOT EXISTS access_grants_companion ON access_grants(companion_id);
CREATE TABLE IF NOT EXISTS invites (
  owner_id text PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  code_hash text UNIQUE NOT NULL,
  expires_at timestamptz NOT NULL
);
CREATE TABLE IF NOT EXISTS share_links (
  owner_id text PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  token text UNIQUE NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS sessions (
  token_hash text PRIMARY KEY,
  user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL,
  attempts integer NOT NULL DEFAULT 0,
  attempt_window timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS sessions_expiry ON sessions(expires_at);
CREATE TABLE IF NOT EXISTS oauth_flows (
  state_hash text PRIMARY KEY,
  nonce text NOT NULL,
  verifier text NOT NULL,
  role text NOT NULL CHECK (role IN ('user', 'companion')),
  expires_at timestamptz NOT NULL
);
