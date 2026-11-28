ALTER TABLE accounts
  ADD COLUMN failed_attempts integer NOT NULL DEFAULT 0,
  ADD COLUMN locked_until timestamptz;

CREATE TABLE login_throttles (
  address text PRIMARY KEY,
  window_started_at timestamptz NOT NULL,
  failed_attempts integer NOT NULL,
  blocked_until timestamptz
);

CREATE TABLE login_devices (
  id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  token_hash text NOT NULL UNIQUE,
  account_id integer NOT NULL REFERENCES accounts (id) ON DELETE CASCADE,
  failed_attempts integer NOT NULL DEFAULT 0,
  user_agent text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_login_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL
);

CREATE INDEX login_devices_account_id ON login_devices (account_id);
