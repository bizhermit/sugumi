/**
 * ログイン中のセッション。ログインに成功したときだけ作るため、ログインしていない利用者が DB を増やすことはできない。
 */
import { type Account, ACCOUNT_COLUMNS, type AccountColumns, toAccount } from "./accounts.ts";
import { audit } from "../audit.ts";
import { clearHostCookie, hostCookie, readCookie } from "../cookie.ts";
import { hashToken, isRandomToken, randomToken } from "../crypto.ts";
import { db } from "../db.ts";
import { SESSION_ABSOLUTE_TIMEOUT_MINUTES, SESSION_IDLE_TIMEOUT_MINUTES } from "../env.ts";

const COOKIE_NAME = "__Host-sid";
const IDLE_TIMEOUT_MS = SESSION_IDLE_TIMEOUT_MINUTES * 60 * 1000;
const ABSOLUTE_TIMEOUT_MS = SESSION_ABSOLUTE_TIMEOUT_MINUTES * 60 * 1000;
/** リクエストのたびに DB へ書き込まないよう、最終アクセス時刻はこの間隔より古くなったときだけ更新する。 */
const TOUCH_INTERVAL_MS = 60 * 1000;
const SWEEP_INTERVAL_MS = 60 * 1000;

/**
 * id は Cookie に入れるトークンそのもの。ログや DB に書かないこと。
 * account はこのリクエストで DB から読んだもの。権限などを足しても、変更は次のリクエストから反映される。
 */
export type Session = { readonly id: string; readonly account: Account };

type SessionRow = AccountColumns & { created_at: Date; last_access_at: Date };

// ログイン中のリクエストのたびに実行するため、名前を付けて DB に解析済みの文を接続ごとに持たせる。
// セッションとアカウントを別々に引くと、DB との往復が 2 回になる
const SELECT_SESSION = {
  name: "select_session",
  text: `SELECT sessions.created_at, sessions.last_access_at, ${ACCOUNT_COLUMNS}
         FROM sessions JOIN accounts ON accounts.id = sessions.account_id
         WHERE sessions.token_hash = $1`,
};

let nextSweepAt = 0;

if (IDLE_TIMEOUT_MS === 0 && ABSOLUTE_TIMEOUT_MS === 0) {
  console.warn(
    "セッションのタイムアウトがどちらも 0 のため、ログアウトするまでセッションが切れません",
  );
}

/** Cookie のセッションが存在し期限内なら返し、操作がない場合の期限を延ばす。 */
export async function getSession(req: Request): Promise<Session | undefined> {
  const token = readCookie(req, COOKIE_NAME);
  if (token === undefined) return undefined;
  // 公開ページでも通るため、でたらめな Cookie で未ログインの利用者が DB の問い合わせを作れないようにする。
  // 形式が違う Cookie も hasSessionCookie() では「ある」ので、期限切れと同じ扱いになる
  if (!isRandomToken(token)) return undefined;
  const hash = await hashToken(token);
  const { rows: [row] } = await db.query<SessionRow>({ ...SELECT_SESSION, values: [hash] });
  if (!row) return undefined;
  const now = Date.now();
  if (isExpired(row, now)) {
    await db.query("DELETE FROM sessions WHERE token_hash = $1", [hash]);
    return undefined;
  }
  if (now - row.last_access_at.getTime() >= TOUCH_INTERVAL_MS) {
    await db.query("UPDATE sessions SET last_access_at = $1 WHERE token_hash = $2", [
      new Date(now),
      hash,
    ]);
  }
  return { id: token, account: toAccount(row) };
}

/** 呼び出し側は sessionCookie() で Cookie を返すこと。 */
export async function createSession(account: Account): Promise<Session> {
  const now = Date.now();
  if (now >= nextSweepAt) {
    nextSweepAt = now + SWEEP_INTERVAL_MS;
    // isExpired() と同じ条件。タイムアウトが 0 なら NULL と比べ、その条件では消さない
    await db.query("DELETE FROM sessions WHERE last_access_at <= $1 OR created_at <= $2", [
      IDLE_TIMEOUT_MS > 0 ? new Date(now - IDLE_TIMEOUT_MS) : null,
      ABSOLUTE_TIMEOUT_MS > 0 ? new Date(now - ABSOLUTE_TIMEOUT_MS) : null,
    ]);
  }
  const token = randomToken();
  await db.query(
    "INSERT INTO sessions (token_hash, account_id, created_at, last_access_at) VALUES ($1, $2, $3, $3)",
    [await hashToken(token), account.id, new Date(now)],
  );
  return { id: token, account };
}

export async function destroySession(session: Session): Promise<void> {
  await db.query("DELETE FROM sessions WHERE token_hash = $1", [await hashToken(session.id)]);
}

/** 呼び出し側は clearSessionCookie() で Cookie を消すこと。 */
export async function logout(session: Session, remoteAddress: string | undefined): Promise<void> {
  await destroySession(session);
  audit("logged_out", { accountId: session.account.id, remoteAddress });
}

/** Cookie はあるのに getSession() が undefined なら、期限切れか削除されたセッションと分かる。 */
export function hasSessionCookie(req: Request): boolean {
  return readCookie(req, COOKIE_NAME) !== undefined;
}

export function sessionCookie(session: Session): string {
  return hostCookie(COOKIE_NAME, session.id);
}

export function clearSessionCookie(): string {
  return clearHostCookie(COOKIE_NAME);
}

function isExpired(row: SessionRow, now: number): boolean {
  return (IDLE_TIMEOUT_MS > 0 && now - row.last_access_at.getTime() >= IDLE_TIMEOUT_MS) ||
    (ABSOLUTE_TIMEOUT_MS > 0 && now - row.created_at.getTime() >= ABSOLUTE_TIMEOUT_MS);
}
