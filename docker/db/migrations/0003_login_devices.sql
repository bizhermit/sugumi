CREATE TABLE login_devices (
  token_hash text PRIMARY KEY,
  account_id integer NOT NULL REFERENCES accounts (id) ON DELETE CASCADE,
  failed_attempts integer NOT NULL DEFAULT 0,
  expires_at timestamptz NOT NULL
);
CREATE INDEX login_devices_account_id ON login_devices (account_id);
