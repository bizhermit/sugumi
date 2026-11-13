import { randomBytes } from "node:crypto";
import type { LoginLimits } from "../../lib/config.ts";
import { transaction, type DataBase } from "../../lib/db.ts";
import type { LoginAccount } from "./login-account.ts";
import { hashPassword, PASSWORD_MAX_LENGTH, verifyPassword } from "./password.ts";
import { recordDeviceLogin, reserveDeviceAttempt, sweepDevices, type DeviceLogin } from "./login-devices.ts";
import { refundAddressAttempt, reserveAddressAttempt, sweepAddressFailures } from "./login-throttle.ts";

export const USERNAME_MAX_LENGTH = 64;

export type AuthInput = {
  readonly username: string;
  readonly password: string;
  readonly remoteAddress: string | undefined; // undefinedなら接続元ごとの制限はしない
  readonly deviceToken: string | undefined;
  readonly userAgent: string;
};

export type AuthResult =
  | {
      readonly status: "ok";
      readonly account: LoginAccount;
      readonly device: DeviceLogin;
      readonly trustedDevice: boolean;
    }
  | {
      readonly status: "wrong_password";
      readonly accountId: number;
      readonly trustedDevice: boolean;
      readonly locksAccount: boolean;
    }
  | { readonly status: "locked"; readonly accountId: number }
  | { readonly status: "unknown_user" }
  | { readonly status: "address_blocked"; readonly blocksAddress: boolean };

// アカウントが無いときも検証にかける用。
// 応答にかかる時間からアカウントの有無を見分けられないようにする。
const DUMMY_HASH = await hashPassword(randomBytes(16).toString("base64url"));

type SelectAccountFailedSqlReturned = {
  failed_attempts: number;
  locked_until: Date | null;
};
const SELECT_ACCOUNT_FAILED_SQL = `
SELECT
  failed_attempts
, locked_until
FROM
  accounts
WHERE
  id = $1
FOR UPDATE
`;

const UPDATE_ACCOUNT_FAILED_SQL = `
UPDATE accounts SET
  failed_attempts = $2
, locked_until = $3
WHERE
  id = $1
`;

async function reserveAccountAttempt(
  db: DataBase,
  limits: LoginLimits,
  accountId: number,
  now: Date,
): Promise<{ allowed: boolean; locks: boolean }> {
  return await transaction(db, async (client) => {
    const { rows } = await client.query<SelectAccountFailedSqlReturned>(SELECT_ACCOUNT_FAILED_SQL, [accountId]);
    const row = rows[0];
    if (row == null) {
      return { allowed: false, locks: false };
    }
    if (row.locked_until != null && row.locked_until.getTime() > now.getTime()) {
      return { allowed: false, locks: false };
    }
    const failedAttempts = (row.locked_until == null ? row.failed_attempts : 0) + 1;
    const locks = failedAttempts >= limits.maxFailedAttempts;
    await client.query(UPDATE_ACCOUNT_FAILED_SQL, [
      accountId,
      failedAttempts,
      locks ? new Date(now.getTime() + limits.lockoutMs) : null,
    ]);
    return { allowed: true, locks };
  });
}

type AccountRow = {
  readonly id: number;
  readonly username: string;
  readonly display_name: string;
  readonly password_hash: string;
};
const SELECT_ACCOUNT_SQL = `
SELECT
  id
, username
, display_name
, password_hash
FROM
  accounts
WHERE
  username = $1
`;

const UPDATE_ACCOUNT_RESET_FAILED_SQL = `
UPDATE accounts SET
  failed_attempts = 0
, locked_until = NULL
WHERE
  id = $1
`;

export async function authenticate(db: DataBase, limits: LoginLimits, input: AuthInput): Promise<AuthResult> {
  const { username, password, remoteAddress, deviceToken, userAgent } = input;
  if (password.length > PASSWORD_MAX_LENGTH) {
    throw new Error(`パスワードが上限（${PASSWORD_MAX_LENGTH}文字）を超えています。`);
  }
  const now = new Date();
  const trustedDevice = await reserveDeviceAttempt(db, limits, deviceToken, username, now);
  const countsAddress = !trustedDevice && remoteAddress != null;

  if (countsAddress) {
    const reserved = await reserveAddressAttempt(db, limits, remoteAddress, now);
    if (!reserved.allowed) {
      await verifyPassword(password, DUMMY_HASH);
      return { status: "address_blocked", blocksAddress: reserved.blocks };
    }
  }

  const { rows } = await db.query<AccountRow>(SELECT_ACCOUNT_SQL, [username]);
  const row = rows[0];
  if (row == null) {
    await verifyPassword(password, DUMMY_HASH);
    return { status: "unknown_user" };
  }

  const attempt = trustedDevice
    ? { allowed: true, locks: false }
    : await reserveAccountAttempt(db, limits, row.id, now);
  // ロック中でも検証して、応答の時間を揃える。
  const ok = await verifyPassword(password, row.password_hash);
  if (!attempt.allowed) {
    return { status: "locked", accountId: row.id };
  }
  if (!ok) {
    return {
      status: "wrong_password",
      accountId: row.id,
      trustedDevice,
      locksAccount: attempt.locks,
    };
  }

  // 覚えている端末から成功しても、アカウントの失敗回数とロックは残す。
  // 本人がログインするたびに消えると、第三者が他の端末から試せる回数が増えてしまう。
  if (!trustedDevice) {
    await db.query(UPDATE_ACCOUNT_RESET_FAILED_SQL, [row.id]);
  }
  if (countsAddress) {
    await refundAddressAttempt(db, remoteAddress);
  }
  const device = await recordDeviceLogin(db, limits, row.id, deviceToken, userAgent, now);
  await sweepDevices(db, now);
  await sweepAddressFailures(db, limits, now);
  return {
    status: "ok",
    account: { id: row.id, username: row.username, displayName: row.display_name },
    device,
    trustedDevice,
  };
}

type InsertAccountSqlReturned = {
  id: number;
};
const INSERT_ACCOUNT_SQL = `
INSERT INTO accounts (
  username
, display_name
, password_hash
) VALUES ($1, $2, $3)
RETURNING id
`;

export async function createAccount(
  db: DataBase,
  username: string,
  displayName: string,
  password: string,
): Promise<number> {
  const { rows } = await db.query<InsertAccountSqlReturned>(INSERT_ACCOUNT_SQL, [
    username,
    displayName,
    await hashPassword(password),
  ]);
  const row = rows[0];
  if (row == null) {
    throw new Error("アカウントを作成できませんでした。");
  }
  return row.id;
}
