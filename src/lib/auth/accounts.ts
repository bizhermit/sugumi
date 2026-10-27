import { randomToken } from "../crypto.ts";
import { db, transaction } from "../db.ts";
import { LOGIN_LOCKOUT_MINUTES, LOGIN_MAX_FAILED_ATTEMPTS } from "../env.ts";
import { logWarning } from "../log.ts";
import * as loginDevices from "./login-devices.ts";
import * as loginThrottle from "./login-throttle.ts";
import {
  hashPassword,
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  verifyPassword,
} from "./password.ts";

const USERNAME_MAX_LENGTH = 64;
const PG_UNIQUE_VIOLATION = "23505";

export type Account = { id: number; username: string; displayName: string };

/**
 * trustedDevice は、ログインしたことのある端末として、アカウントのロックと接続元ごとの制限を受けなかったとき true。
 * deviceToken は、その端末を覚えておくトークン。loginDeviceCookie() で Cookie にして返すこと。
 */
export type AuthResult =
  | { status: "ok"; account: Account; trustedDevice: boolean; deviceToken: string | undefined }
  /** locked はこの失敗でロックしたとき true。 */
  | { status: "wrong_password"; account: Account; locked: boolean; trustedDevice: boolean }
  | { status: "locked"; account: Account }
  | { status: "unknown_user" }
  /**
   * 接続元からの失敗が多く、パスワードを確かめなかった。blocks はこの回で制限を始めたとき true。
   * blockedAddress は制限した単位（IPv6 は /64）で、login_throttles の address。
   */
  | { status: "address_blocked"; blocks: boolean; blockedAddress: string };

type AccountRow = {
  id: number;
  username: string;
  display_name: string;
  password_hash: string;
  failed_attempts: number;
  locked_until: Date | null;
};

/**
 * Account にする列。ほかのテーブルと JOIN する問い合わせでも使えるよう、テーブル名を付けている。
 * Account に項目を足すときは、この列と toAccount() を直す。
 */
export const ACCOUNT_COLUMNS = "accounts.id, accounts.username, accounts.display_name";
export type AccountColumns = Pick<AccountRow, "id" | "username" | "display_name">;

if (LOGIN_MAX_FAILED_ATTEMPTS === 0) {
  logWarning("LOGIN_MAX_FAILED_ATTEMPTS が 0 のため、ログインの試行回数を制限していません");
}

const DUMMY_HASH = await hashPassword(randomToken());

/**
 * 呼び出し側は、どの失敗かを利用者に区別して見せないこと。アカウントの有無やロックの状態が分かってしまう。
 * remoteAddress は ctx.remoteAddress。undefined なら接続元ごとには数えない。
 * deviceToken は readLoginDevice() の値。
 */
export async function authenticate(
  username: string,
  password: string,
  remoteAddress: string | undefined,
  deviceToken: string | undefined,
): Promise<AuthResult> {
  // 長い入力で重いハッシュを計算させ、CPU を使い切らせないため、上限を超えたら計算しない。
  // アカウントの有無に関わらず計算しないため、応答時間の差は出ない
  const checkable = password.length <= PASSWORD_MAX_LENGTH;
  const now = Date.now();
  const trustedDevice = await loginDevices.reserveAttempt(deviceToken, username, now);
  let throttled: loginThrottle.Attempt | undefined;
  // 端末からの試行は端末ごとに数えたため、接続元ごとには数えない。
  // 同じ NAT の中の誰かの失敗や、攻撃者に制限させられた接続元から、本人がログインできなくならないようにするため
  if (!trustedDevice) {
    const reserved = await loginThrottle.reserveAttempt(remoteAddress, now);
    if (reserved.status === "blocked") {
      // 確かめたときと同じだけ時間をかけ、応答時間から制限中だと見分けられないようにする
      if (checkable) await verifyPassword(password, DUMMY_HASH);
      return { status: "address_blocked", blocks: reserved.blocks, blockedAddress: reserved.key };
    }
    throttled = reserved.attempt;
  }
  const { rows: [row] } = await db.query<AccountColumns & Pick<AccountRow, "password_hash">>(
    `SELECT ${ACCOUNT_COLUMNS}, password_hash FROM accounts WHERE username = $1`,
    [username],
  );
  if (!row) {
    // アカウントがあるときと同じだけ時間をかけ、応答時間からアカウントの有無を見分けられないようにする
    if (checkable) await verifyPassword(password, DUMMY_HASH);
    return { status: "unknown_user" };
  }
  const account = toAccount(row);
  // 端末からの試行は、アカウントのロックを受けず、アカウントの失敗としても数えない
  const attempt = trustedDevice ? { locks: false } : await reserveAttempt(row.id, now);
  const ok = checkable && await verifyPassword(password, row.password_hash);
  if (!attempt) return { status: "locked", account };
  if (!ok) return { status: "wrong_password", account, locked: attempt.locks, trustedDevice };
  // 端末から成功しても、アカウントの失敗の回数とロックは残す。
  // 本人がログインするたびに消えると、攻撃者がほかの端末から試せる回数が増えるため
  if (!trustedDevice) {
    await db.query("UPDATE accounts SET failed_attempts = 0, locked_until = NULL WHERE id = $1", [
      row.id,
    ]);
    await loginThrottle.refundAttempt(throttled);
  }
  return {
    status: "ok",
    account,
    trustedDevice,
    deviceToken: await loginDevices.issue(row.id, deviceToken, now),
  };
}

/**
 * 検証の前に失敗として 1 回数え、ロック中なら undefined を返す。
 * LOGIN_MAX_FAILED_ATTEMPTS が 0 なら数えず、それまでのロックも無視する。
 * 検証の後で数えると、検証中に並行して送られたリクエストが上限を超えて試せてしまうため。
 * 上限に達する回で先にロックするのは、検証中にプロセスが落ちてもロックが残るようにするため。
 * 並行して送られたリクエストが同じ回数を読んで数え漏れないよう、行をロックして読む。
 */
async function reserveAttempt(id: number, now: number) {
  if (LOGIN_MAX_FAILED_ATTEMPTS === 0) return { locks: false };
  return await transaction(async (client) => {
    const { rows: [{ failed_attempts, locked_until }] } = await client.query<
      Pick<AccountRow, "failed_attempts" | "locked_until">
    >("SELECT failed_attempts, locked_until FROM accounts WHERE id = $1 FOR UPDATE", [id]);
    if (locked_until !== null && locked_until.getTime() > now) return undefined;
    const attempts = (locked_until === null ? failed_attempts : 0) + 1;
    const locks = attempts >= LOGIN_MAX_FAILED_ATTEMPTS;
    await client.query(
      "UPDATE accounts SET failed_attempts = $1, locked_until = $2 WHERE id = $3",
      [
        attempts,
        locks ? new Date(now + LOGIN_LOCKOUT_MINUTES * 60 * 1000) : null,
        id,
      ],
    );
    return { locks };
  });
}

/** ロックと失敗の回数を消し、そのアカウントを返す。アカウントがなければ undefined を返す。 */
export async function unlockAccount(id: number): Promise<Account | undefined> {
  const { rows: [row] } = await db.query<AccountColumns>(
    `UPDATE accounts SET failed_attempts = 0, locked_until = NULL WHERE id = $1
     RETURNING ${ACCOUNT_COLUMNS}`,
    [id],
  );
  return row && toAccount(row);
}

export async function findAccount(id: number): Promise<Account | undefined> {
  const { rows: [row] } = await db.query<AccountColumns>(
    `SELECT ${ACCOUNT_COLUMNS} FROM accounts WHERE id = $1`,
    [id],
  );
  return row && toAccount(row);
}

/** 入力が条件を満たさない場合や、ユーザー名が使われている場合は例外を投げる。 */
export async function createAccount(
  username: string,
  displayName: string,
  password: string,
): Promise<Account> {
  if (username === "" || username.length > USERNAME_MAX_LENGTH || /[\p{Cc}\s]/u.test(username)) {
    throw new Error(`ユーザー名は空白を含まない ${USERNAME_MAX_LENGTH} 文字以内にしてください`);
  }
  if (displayName.trim() === "") throw new Error("表示名を入力してください");
  if (password.length < PASSWORD_MIN_LENGTH || password.length > PASSWORD_MAX_LENGTH) {
    throw new Error(
      `パスワードは ${PASSWORD_MIN_LENGTH} 文字以上 ${PASSWORD_MAX_LENGTH} 文字以内にしてください`,
    );
  }
  const hash = await hashPassword(password);
  try {
    const { rows: [row] } = await db.query<AccountColumns>(
      `INSERT INTO accounts (username, display_name, password_hash) VALUES ($1, $2, $3)
       RETURNING ${ACCOUNT_COLUMNS}`,
      [username, displayName, hash],
    );
    return toAccount(row);
  } catch (e) {
    if ((e as { code?: string }).code === PG_UNIQUE_VIOLATION) {
      throw new Error(`ユーザー名 ${username} は使われています`);
    }
    throw e;
  }
}

export function toAccount(row: AccountColumns): Account {
  return { id: row.id, username: row.username, displayName: row.display_name };
}
