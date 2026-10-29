CREATE TABLE accounts (
  id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  username text NOT NULL UNIQUE,
  display_name text NOT NULL,
  password_hash text NOT NULL,
  failed_attempts integer NOT NULL DEFAULT 0,
  locked_until timestamptz
);

CREATE TABLE sessions (
  token_hash text PRIMARY KEY,
  account_id integer NOT NULL REFERENCES accounts (id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL,
  last_access_at timestamptz NOT NULL
);
CREATE INDEX sessions_account_id ON sessions (account_id);

CREATE TABLE secrets (
  name text PRIMARY KEY,
  value bytea NOT NULL
);
