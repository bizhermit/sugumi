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

export const USERNAME_MAX_LENGTH = 64;
const PG_UNIQUE_VIOLATION = "23505";

export type Account = { id: number; username: string; displayName: string };

/**
 * trustedDevice は、ログインしたことのある端末だったので、アカウントのロックと接続元ごとの制限を受けなかったとき true。
 * deviceToken は、その端末を覚えておくためのトークン。loginDeviceCookie() で Cookie にしてレスポンスに入れること。
 */
export type AuthResult =
  | { status: "ok"; account: Account; trustedDevice: boolean; deviceToken: string | undefined }
  /** locked は、この失敗でロックしたとき true。 */
  | { status: "wrong_password"; account: Account; locked: boolean; trustedDevice: boolean }
  | { status: "locked"; account: Account }
  | { status: "unknown_user" }
  /**
   * 接続元からの失敗が多いので、パスワードを確かめなかった。blocks は、この回で制限を始めたとき true。
   * blockedAddress は制限の単位（IPv6 は /64）で、login_throttles の address の値。
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
 * Account を作るのに読む列。ほかのテーブルと JOIN するクエリでも使えるよう、テーブル名を付けている。
 * Account に項目を足すときは、この列と toAccount() も直す。
 */
export const ACCOUNT_COLUMNS = "accounts.id, accounts.username, accounts.display_name";
export type AccountColumns = Pick<AccountRow, "id" | "username" | "display_name">;

if (LOGIN_MAX_FAILED_ATTEMPTS === 0) {
  logWarning("LOGIN_MAX_FAILED_ATTEMPTS が 0 なので、ログインの試行回数を制限していません");
}

const DUMMY_HASH = await hashPassword(randomToken());

/**
 * ユーザー名とパスワードでログインを試み、結果を返す。失敗の回数を数え、上限に達したらロックする。
 * 呼び出し側は、どの失敗だったかをユーザーに区別して見せないこと。アカウントの有無やロックの状態が分かってしまう。
 * remoteAddress には ctx.remoteAddress を渡す。undefined なら、接続元ごとには数えない。
 * deviceToken には readLoginDevice() の値を渡す。
 */
export async function authenticate(
  username: string,
  password: string,
  remoteAddress: string | undefined,
  deviceToken: string | undefined,
): Promise<AuthResult> {
  // 長い入力でハッシュの計算を重くされ、CPU を使い切られないよう、上限を超えたら計算しない。
  // アカウントの有無に関わらず計算しないので、レスポンスの時間に差は出ない。
  const checkable = password.length <= PASSWORD_MAX_LENGTH;
  const now = Date.now();
  const trustedDevice = await loginDevices.reserveAttempt(deviceToken, username, now);
  let throttled: loginThrottle.Attempt | undefined;
  // 覚えている端末からの試行は、端末ごとに数えたので、接続元ごとには数えない。
  // 同じ NAT の中の誰かが失敗したときや、攻撃者がわざと接続元を制限させたときにも、本人がログインできるようにするため。
  if (!trustedDevice) {
    const reserved = await loginThrottle.reserveAttempt(remoteAddress, now);
    if (reserved.status === "blocked") {
      // パスワードを確かめたときと同じだけ時間をかけ、レスポンスの時間から制限中だと見分けられないようにする。
      if (checkable) {
        await verifyPassword(password, DUMMY_HASH);
      }
      return { status: "address_blocked", blocks: reserved.blocks, blockedAddress: reserved.key };
    }
    throttled = reserved.attempt;
  }
  const { rows: [row] } = await db.query<AccountColumns & Pick<AccountRow, "password_hash">>(
    `SELECT ${ACCOUNT_COLUMNS}, password_hash FROM accounts WHERE username = $1`,
    [username],
  );
  if (!row) {
    // アカウントがあるときと同じだけ時間をかけ、レスポンスの時間からアカウントの有無を見分けられないようにする。
    if (checkable) {
      await verifyPassword(password, DUMMY_HASH);
    }
    return { status: "unknown_user" };
  }
  const account = toAccount(row);
  // 覚えている端末からの試行は、アカウントのロックを受けず、アカウントの失敗としても数えない。
  const attempt = trustedDevice ? { locks: false } : await reserveAttempt(row.id, now);
  const ok = checkable && await verifyPassword(password, row.password_hash);
  if (!attempt) {
    return { status: "locked", account };
  }
  if (!ok) {
    return { status: "wrong_password", account, locked: attempt.locks, trustedDevice };
  }
  // 覚えている端末から成功しても、アカウントの失敗の回数とロックは残す。
  // 本人がログインするたびに消えると、攻撃者がほかの端末から試せる回数が増えてしまう。
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
 * パスワードの検証の前に失敗として 1 回数え、ロック中なら undefined を返す。
 * LOGIN_MAX_FAILED_ATTEMPTS が 0 なら数えず、それまでのロックも無視する。
 * 検証の後で数えると、検証している間に同時に送られたリクエストが、上限を超えて試せてしまう。
 * 上限に達する回で検証より先にロックするのは、検証中にプロセスが落ちてもロックが残るようにするため。
 * 同時に送られたリクエストが同じ回数を読んで数え漏れないよう、行をロックして読む。
 */
async function reserveAttempt(id: number, now: number): Promise<{ locks: boolean } | undefined> {
  if (LOGIN_MAX_FAILED_ATTEMPTS === 0) {
    return { locks: false };
  }
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

/** アカウントのロックと失敗の回数を消し、そのアカウントを返す。アカウントがなければ undefined を返す。 */
export async function unlockAccount(id: number): Promise<Account | undefined> {
  const { rows: [row] } = await db.query<AccountColumns>(
    `UPDATE accounts SET failed_attempts = 0, locked_until = NULL WHERE id = $1
     RETURNING ${ACCOUNT_COLUMNS}`,
    [id],
  );
  return row && toAccount(row);
}

/** id のアカウントを返す。なければ undefined を返す。 */
export async function findAccount(id: number): Promise<Account | undefined> {
  const { rows: [row] } = await db.query<AccountColumns>(
    `SELECT ${ACCOUNT_COLUMNS} FROM accounts WHERE id = $1`,
    [id],
  );
  return row && toAccount(row);
}

/**
 * invalid_username は、ユーザー名が空か、空白・制御文字を含むか、USERNAME_MAX_LENGTH 文字を超えるとき。
 * invalid_password は、パスワードが PASSWORD_MIN_LENGTH 文字未満か PASSWORD_MAX_LENGTH 文字を超えるとき。
 */
export type CreateAccountResult =
  | { status: "ok"; account: Account }
  | { status: "invalid_username" }
  | { status: "invalid_display_name" }
  | { status: "invalid_password" }
  | { status: "username_taken" };

/**
 * アカウントを作る。入力が条件を満たさないときと、ユーザー名がすでに使われているときは、作らずに status で返す。
 * 表示する文言は呼び出し側で決める。DB の想定外のエラーは例外を投げる。
 */
export async function createAccount(
  username: string,
  displayName: string,
  password: string,
): Promise<CreateAccountResult> {
  if (username === "" || username.length > USERNAME_MAX_LENGTH || /[\p{Cc}\s]/u.test(username)) {
    return { status: "invalid_username" };
  }
  if (displayName.trim() === "") {
    return { status: "invalid_display_name" };
  }
  if (password.length < PASSWORD_MIN_LENGTH || password.length > PASSWORD_MAX_LENGTH) {
    return { status: "invalid_password" };
  }
  const hash = await hashPassword(password);
  try {
    const { rows: [row] } = await db.query<AccountColumns>(
      `INSERT INTO accounts (username, display_name, password_hash) VALUES ($1, $2, $3)
       RETURNING ${ACCOUNT_COLUMNS}`,
      [username, displayName, hash],
    );
    return { status: "ok", account: toAccount(row) };
  } catch (e) {
    if ((e as { code?: string }).code === PG_UNIQUE_VIOLATION) {
      return { status: "username_taken" };
    }
    throw e;
  }
}

/** ACCOUNT_COLUMNS で読んだ行を Account にする。 */
export function toAccount(row: AccountColumns): Account {
  return { id: row.id, username: row.username, displayName: row.display_name };
}
