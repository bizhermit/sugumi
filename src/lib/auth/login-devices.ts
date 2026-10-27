/**
 * ログインに成功したことのある端末を覚えておく。その端末からのログインは、アカウントのロックと接続元ごとの制限を受けない。
 * ユーザー名を知っているだけの第三者が、わざと失敗を重ねて本人を締め出せないようにするため。
 * ただし、Cookie を盗まれたときに無制限に試されないよう、端末ごとにも LOGIN_MAX_FAILED_ATTEMPTS 回まで失敗を数える。
 */
import { hostCookie, readCookie } from "../cookie.ts";
import { hashToken, isRandomToken, randomToken } from "../crypto.ts";
import { db } from "../db.ts";
import { LOGIN_DEVICE_DAYS, LOGIN_MAX_FAILED_ATTEMPTS } from "../env.ts";

const COOKIE_NAME = "__Host-device";
const LIFETIME_SECONDS = LOGIN_DEVICE_DAYS * 24 * 60 * 60;
const SWEEP_INTERVAL_MS = 60 * 1000;

let nextSweepAt = 0;

/** Cookie から端末のトークンを読む。戻り値は、そのまま authenticate() に渡す。 */
export function readLoginDevice(req: Request): string | undefined {
  return readCookie(req, COOKIE_NAME);
}

/** 端末のトークンを保存する Set-Cookie ヘッダーの値を返す。token には authenticate() が返した deviceToken を渡す。 */
export function loginDeviceCookie(token: string): string {
  return `${hostCookie(COOKIE_NAME, token)}; Max-Age=${LIFETIME_SECONDS}`;
}

/**
 * token が username のアカウントで有効な端末なら、パスワードの検証の前に失敗として 1 回数え、true を返す。
 * 上限に達した端末には false を返す。その端末は、ほかの端末と同じくアカウントのロックの対象になる。
 * LOGIN_MAX_FAILED_ATTEMPTS が 0 なら、どの端末も信頼しない。このときはアカウントのロックもないので、
 * 接続元ごとの制限まで外すと、盗んだ Cookie で無制限に試せてしまう。
 */
export async function reserveAttempt(
  token: string | undefined,
  username: string,
  now: number,
): Promise<boolean> {
  if (token === undefined || !isRandomToken(token) || LOGIN_MAX_FAILED_ATTEMPTS === 0) return false;
  // 上限の確認と加算を 1 つの文で行うので、同時に送られたリクエストがあっても上限を超えて数えない。
  const { rowCount } = await db.query(
    `UPDATE login_devices SET failed_attempts = login_devices.failed_attempts + 1
     FROM accounts
     WHERE login_devices.token_hash = $1 AND login_devices.account_id = accounts.id
       AND accounts.username = $2 AND login_devices.expires_at > $3
       AND login_devices.failed_attempts < $4`,
    [await hashToken(token), username, new Date(now), LOGIN_MAX_FAILED_ATTEMPTS],
  );
  return rowCount === 1;
}

/**
 * ログインに成功した端末に渡す、新しいトークンを返す。replacing には、その端末が送ってきた古いトークンを渡す。古いトークンは使えなくなる。
 * LOGIN_MAX_FAILED_ATTEMPTS が 0 なら端末を信頼しないので、トークンを作らずに undefined を返す。
 */
export async function issue(
  accountId: number,
  replacing: string | undefined,
  now: number,
): Promise<string | undefined> {
  if (LOGIN_MAX_FAILED_ATTEMPTS === 0) return undefined;
  if (now >= nextSweepAt) {
    nextSweepAt = now + SWEEP_INTERVAL_MS;
    await sweep(now);
  }
  if (replacing !== undefined && isRandomToken(replacing)) {
    await db.query("DELETE FROM login_devices WHERE token_hash = $1", [await hashToken(replacing)]);
  }
  const token = randomToken();
  await db.query(
    "INSERT INTO login_devices (token_hash, account_id, expires_at) VALUES ($1, $2, $3)",
    [await hashToken(token), accountId, new Date(now + LIFETIME_SECONDS * 1000)],
  );
  return token;
}

/** 期限が切れた端末と、reserveAttempt() で上限に達した端末の行を消す。 */
export async function sweep(now: number): Promise<void> {
  await db.query("DELETE FROM login_devices WHERE expires_at <= $1 OR failed_attempts >= $2", [
    new Date(now),
    LOGIN_MAX_FAILED_ATTEMPTS,
  ]);
}
