CREATE TABLE login_throttles (
  address text PRIMARY KEY,
  window_started_at timestamptz NOT NULL,
  failed_attempts integer NOT NULL,
  blocked_until timestamptz
);
