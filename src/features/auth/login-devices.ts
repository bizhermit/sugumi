import { createHash, randomBytes } from "node:crypto";
import type { DataBase } from "../../lib/db.ts";
import { hostCookie, readCookie } from "../../web/cookie.ts";
import type { LoginLimits } from "../../lib/config.ts";

/**
 * ログインに成功した端末を記録する。
 * 記録済みの端末からの試行は、アカウントロックと接続元の制限を受けない。
 * ユーザー名を知っているだけの第三者が、故意に失敗を重ねて本人を締め出せないようにする。
 * Cookieを盗まれても無制限には試せないよう、端末ごとに失敗も記録する。
 */

const COOKIE_NAME = "device";
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/; // 32バイトのbase64url
const USER_AGENT_MAX_LENGTH = 256;

export type DeviceLogin = {
  readonly token: string;
  readonly isNew: boolean;
};

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("base64url");
}

export function readDeviceToken(req: Request): string | undefined {
  const token = readCookie(req, COOKIE_NAME);
  return token != null && TOKEN_PATTERN.test(token) ? token : undefined;
}

export function deviceCookie(limits: LoginLimits, token: string): string {
  return hostCookie(COOKIE_NAME, token, { maxAge: limits.deviceLifetimeMs / 1000 });
}

export function readUserAgent(req: Request): string {
  return (req.headers.get("user-agent") ?? "").slice(0, USER_AGENT_MAX_LENGTH);
}

const UPDATE_LOGIN_DEVICE_FAILED_SQL = `
UPDATE login_devices SET
  failed_attempts = login_devices.failed_attempts + 1
FROM accounts
WHERE
      login_devices.token_hash = $1
  AND login_devices.account_id = accounts.id
  AND accounts.username = $2
  AND login_devices.expires_at > $3
  AND login_devices.failed_attempts < $4
`;

export async function reserveDeviceAttempt(
  db: DataBase,
  limits: LoginLimits,
  token: string | undefined,
  username: string,
  now: Date,
): Promise<boolean> {
  if (token == null) return false;
  const { rowCount } = await db.query(UPDATE_LOGIN_DEVICE_FAILED_SQL, [
    hashToken(token),
    username,
    now,
    limits.maxFailedAttempts,
  ]);
  return rowCount === 1;
}

const UPDATE_LOGIN_DEVICE_SQL = `
UPDATE login_devices SET
  failed_attempts = 0
, user_agent = $3
, last_login_at = $4
, expires_at = $5
WHERE
      token_hash = $1
  AND account_id = $2
`;

const INSERT_LOGIN_DEVICE_SQL = `
INSERT INTO login_devices (
  token_hash
, account_id
, user_agent
, created_at
, last_login_at
, expires_at
) VALUES ($1, $2, $3, $4, $4, $5)
`;

export async function recordDeviceLogin(
  db: DataBase,
  limits: LoginLimits,
  accountId: number,
  token: string | undefined,
  userAgent: string,
  now: Date,
): Promise<DeviceLogin> {
  const expiresAt = new Date(now.getTime() + limits.deviceLifetimeMs);
  if (token != null) {
    const { rowCount } = await db.query(UPDATE_LOGIN_DEVICE_SQL, [
      hashToken(token),
      accountId,
      userAgent,
      now,
      expiresAt,
    ]);
    if (rowCount === 1) {
      return { token, isNew: false };
    }
  }
  const newToken = randomBytes(32).toString("base64url");
  await db.query(INSERT_LOGIN_DEVICE_SQL, [hashToken(newToken), accountId, userAgent, now, expiresAt]);
  return { token: newToken, isNew: true };
}

const DELETE_EXPIRED_LOGIN_DEVICES_SQL = `
DELETE FROM login_devices
WHERE expires_at <= $1
`;

export async function sweepDevices(db: DataBase, now: Date): Promise<void> {
  await db.query(DELETE_EXPIRED_LOGIN_DEVICES_SQL, [now]);
}
