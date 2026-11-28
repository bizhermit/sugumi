import type { LoginLimits, SessionLimits } from "../../../src/lib/config.ts";

const MINUTE_MS = 60 * 1000;

export const TEST_LOGIN_LIMITS: LoginLimits = {
  maxFailedAttempts: 3,
  lockoutMs: 15 * MINUTE_MS,
  addressMaxFailedAttempts: 4,
  addressWindowMs: 15 * MINUTE_MS,
  addressBlockMs: 15 * MINUTE_MS,
  deviceLifetimeMs: 90 * 24 * 60 * MINUTE_MS,
};

export const TEST_SESSION_LIMITS: SessionLimits = {
  idleTimeoutMs: 30 * MINUTE_MS,
  absoluteTimeoutMs: 12 * 60 * MINUTE_MS,
};
