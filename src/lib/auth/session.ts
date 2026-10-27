/**
 * ログイン中のセッションを扱う。セッションはログインに成功したときだけ作るので、ログインしていないユーザーが DB の行を増やすことはできない。
 */
import { type Account, ACCOUNT_COLUMNS, type AccountColumns, toAccount } from "./accounts.ts";
import { audit, type AuditSource } from "../audit.ts";
import { clearHostCookie, hostCookie, readCookie } from "../cookie.ts";
import { hashToken, isRandomToken, randomToken } from "../crypto.ts";
import { db } from "../db.ts";
import { logWarning } from "../log.ts";
import { SESSION_ABSOLUTE_TIMEOUT_MINUTES, SESSION_IDLE_TIMEOUT_MINUTES } from "../env.ts";

const COOKIE_NAME = "__Host-sid";
const IDLE_TIMEOUT_MS = SESSION_IDLE_TIMEOUT_MINUTES * 60 * 1000;
const ABSOLUTE_TIMEOUT_MS = SESSION_ABSOLUTE_TIMEOUT_MINUTES * 60 * 1000;
/** リクエストのたびに DB へ書き込まないよう、最終アクセス時刻は、この間隔より古くなったときだけ更新する。 */
const TOUCH_INTERVAL_MS = 60 * 1000;
const SWEEP_INTERVAL_MS = 60 * 1000;

/**
 * id は Cookie に入れるトークンそのもの。ログや DB に書かないこと。
 * logId は、ログの中でセッション（1 回のログイン）を指す ID。トークンとは無関係に振るので、ログに出してよい。
 * account は、このリクエストで DB から読んだもの。権限などを変えても、反映されるのは次のリクエストから。
 */
export type Session = { readonly id: string; readonly logId: string; readonly account: Account };

type SessionRow = AccountColumns & { log_id: string; created_at: Date; last_access_at: Date };

// ログイン中はリクエストのたびに実行するので、名前を付けてプリペアドステートメントにし、接続ごとに使い回す。
// セッションとアカウントを別々に読むと、DB との往復が 2 回になるので JOIN する。
const SELECT_SESSION = {
  name: "select_session",
  text: `SELECT sessions.log_id, sessions.created_at, sessions.last_access_at, ${ACCOUNT_COLUMNS}
         FROM sessions JOIN accounts ON accounts.id = sessions.account_id
         WHERE sessions.token_hash = $1`,
};

let nextSweepAt = 0;

if (IDLE_TIMEOUT_MS === 0 && ABSOLUTE_TIMEOUT_MS === 0) {
  logWarning(
    "セッションのタイムアウトがどちらも 0 なので、ログアウトするまでセッションが切れません",
  );
}

/**
 * Cookie のセッションが存在して期限内なら返す。操作がないまま切れる期限（SESSION_IDLE_TIMEOUT_MINUTES）は延ばす。
 * なければ undefined を返す。
 */
export async function getSession(req: Request): Promise<Session | undefined> {
  const token = readCookie(req, COOKIE_NAME);
  if (token === undefined) return undefined;
  // 公開ページでも通る処理なので、未ログインのユーザーがでたらめな Cookie を送るだけで DB にクエリが飛ばないようにする。
  // 形式が違う Cookie も hasSessionCookie() では「ある」と判定するので、期限切れと同じ扱いになる。
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
  return { id: token, logId: row.log_id, account: toAccount(row) };
}

/** ログインに成功したアカウントのセッションを作る。呼び出し側は、sessionCookie() の値をレスポンスの Set-Cookie に入れること。 */
export async function createSession(account: Account): Promise<Session> {
  const now = Date.now();
  if (now >= nextSweepAt) {
    nextSweepAt = now + SWEEP_INTERVAL_MS;
    // isExpired() と同じ条件で消す。タイムアウトが 0 の条件は NULL と比べるので、どの行にも当てはまらない。
    await db.query("DELETE FROM sessions WHERE last_access_at <= $1 OR created_at <= $2", [
      IDLE_TIMEOUT_MS > 0 ? new Date(now - IDLE_TIMEOUT_MS) : null,
      ABSOLUTE_TIMEOUT_MS > 0 ? new Date(now - ABSOLUTE_TIMEOUT_MS) : null,
    ]);
  }
  const token = randomToken();
  const logId = crypto.randomUUID();
  await db.query(
    "INSERT INTO sessions (token_hash, log_id, account_id, created_at, last_access_at) VALUES ($1, $2, $3, $4, $4)",
    [await hashToken(token), logId, account.id, new Date(now)],
  );
  return { id: token, logId, account };
}

/** セッションを DB から消す。監査ログを出さないので、ログアウトには logout() を使う。 */
export async function destroySession(session: Session): Promise<void> {
  await db.query("DELETE FROM sessions WHERE token_hash = $1", [await hashToken(session.id)]);
}

/** セッションを消し、監査ログを出す。呼び出し側は、clearSessionCookie() の値をレスポンスの Set-Cookie に入れること。 */
export async function logout(session: Session, source: AuditSource): Promise<void> {
  await destroySession(session);
  audit("logged_out", source, { accountId: session.account.id, sessionLogId: session.logId });
}

/**
 * セッションの Cookie が送られてきていれば true を返す。
 * true なのに getSession() が undefined なら、期限切れか削除されたセッションだと分かる。
 */
export function hasSessionCookie(req: Request): boolean {
  return readCookie(req, COOKIE_NAME) !== undefined;
}

/** createSession() で作ったセッションを、ブラウザに保存させる Set-Cookie ヘッダーの値を返す。 */
export function sessionCookie(session: Session): string {
  return hostCookie(COOKIE_NAME, session.id);
}

/** セッションの Cookie を消す Set-Cookie ヘッダーの値を返す。 */
export function clearSessionCookie(): string {
  return clearHostCookie(COOKIE_NAME);
}

function isExpired(row: SessionRow, now: number) {
  return (IDLE_TIMEOUT_MS > 0 && now - row.last_access_at.getTime() >= IDLE_TIMEOUT_MS) ||
    (ABSOLUTE_TIMEOUT_MS > 0 && now - row.created_at.getTime() >= ABSOLUTE_TIMEOUT_MS);
}
