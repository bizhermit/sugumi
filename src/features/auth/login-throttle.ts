import type { DataBase } from "../../lib/db.ts";
import type { LoginLimits } from "../../lib/config.ts";

/**
 * 接続元（IPアドレス）ごとのログイン試行の制限。
 * アカウント名を変えながら試す攻撃を遅くする。アカウントロックとは独立に数える。
 * パスワードの検証の前に試行として数え、成功したら戻す。
 */

type SelectBlockedUntilSqlReturned = {
  blocked_until: Date | null;
};
const SELECT_BLOCKED_UNTIL_SQL = `
SELECT
  blocked_until
FROM
  login_throttles
WHERE
  address = $1
`;

export async function isAddressBlocked(db: DataBase, address: string, now: Date): Promise<boolean> {
  const { rows } = await db.query<SelectBlockedUntilSqlReturned>(SELECT_BLOCKED_UNTIL_SQL, [address]);
  const blockedUntil = rows[0]?.blocked_until;
  return blockedUntil != null && blockedUntil.getTime() > now.getTime();
}

const RESTARTS_COUNT = `(
  login_throttles.window_started_at <= $3
OR (
      login_throttles.blocked_until IS NOT NULL
  AND login_throttles.blocked_until <= $2
)
)`;

type UpdateLoginThrottleSqlReturned = {
  failed_attempts: number;
};
const UPSERT_LOGIN_THROTTLE_SQL = `
INSERT INTO login_throttles (
  address
, window_started_at
, failed_attempts
) VALUES ($1, $2, 1)
ON CONFLICT (address) DO UPDATE SET
  window_started_at = CASE
    WHEN ${RESTARTS_COUNT} THEN $2
    ELSE login_throttles.window_started_at
  END
, failed_attempts = CASE
    WHEN ${RESTARTS_COUNT} THEN 1
    ELSE login_throttles.failed_attempts + 1
  END
, blocked_until = CASE
    WHEN ${RESTARTS_COUNT} THEN NULL
    ELSE login_throttles.blocked_until
  END
RETURNING failed_attempts
`;

const UPDATE_LOGIN_THROTTLE_BLOCKED_SQL = `
UPDATE login_throttles SET
  blocked_until = $2
WHERE
      address = $1
  AND blocked_until IS NULL
`;

export async function reserveAddressAttempt(
  db: DataBase,
  limits: LoginLimits,
  address: string,
  now: Date,
): Promise<{ allowed: boolean; blocks: boolean }> {
  if (await isAddressBlocked(db, address, now)) {
    return { allowed: false, blocks: false };
  }
  const windowStartLimit = new Date(now.getTime() - limits.addressWindowMs);
  const { rows } = await db.query<UpdateLoginThrottleSqlReturned>(UPSERT_LOGIN_THROTTLE_SQL, [
    address,
    now,
    windowStartLimit,
  ]);
  const failedAttempts = rows[0]?.failed_attempts ?? 0;
  if (failedAttempts <= limits.addressMaxFailedAttempts) {
    return { allowed: true, blocks: false };
  }
  // 同時に上限を超えたリクエストのうち、最初の1つだけ遮断を始める。
  const { rowCount } = await db.query(UPDATE_LOGIN_THROTTLE_BLOCKED_SQL, [
    address,
    new Date(now.getTime() + limits.addressBlockMs),
  ]);
  return { allowed: false, blocks: rowCount === 1 };
}

export async function refundAddressAttempt(db: DataBase, address: string): Promise<void> {
  await db.query(
    "UPDATE login_throttles SET failed_attempts = failed_attempts - 1 WHERE address = $1 AND failed_attempts > 0",
    [address],
  );
}

const DELETE_EXPIRED_LOGIN_THROTTLES_SQL = `
DELETE FROM login_throttles
WHERE
      window_started_at <= $1
  AND (
       blocked_until IS NULL
    OR blocked_until <= $2
  )
`;

export async function sweepAddressFailures(db: DataBase, limits: LoginLimits, now: Date): Promise<void> {
  await db.query(DELETE_EXPIRED_LOGIN_THROTTLES_SQL, [new Date(now.getTime() - limits.addressWindowMs), now]);
}
