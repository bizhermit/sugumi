/**
 * ログイン中のセッション。ログインに成功したときだけ作るため、ログインしていない利用者が DB を増やすことはできない。
 */
import { audit } from "../audit.ts";
import { clearHostCookie, hostCookie, readCookie } from "../cookie.ts";
import { randomToken } from "../crypto.ts";
import { db } from "../db.ts";
import { SESSION_ABSOLUTE_TIMEOUT_MINUTES, SESSION_IDLE_TIMEOUT_MINUTES } from "../env.ts";

const COOKIE_NAME = "__Host-sid";
const IDLE_TIMEOUT_MS = SESSION_IDLE_TIMEOUT_MINUTES * 60 * 1000;
const ABSOLUTE_TIMEOUT_MS = SESSION_ABSOLUTE_TIMEOUT_MINUTES * 60 * 1000;
/** リクエストのたびに DB へ書き込まないよう、最終アクセス時刻はこの間隔より古くなったときだけ更新する。 */
const TOUCH_INTERVAL_MS = 60 * 1000;
const SWEEP_INTERVAL_MS = 60 * 1000;

/** id は Cookie に入れるトークンそのもの。ログや DB に書かないこと。 */
export type Session = { readonly id: string; readonly accountId: number };

type SessionRow = { account_id: number; created_at: Date; last_access_at: Date };

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
  const hash = await hashToken(token);
  const { rows: [row] } = await db.query<SessionRow>(
    "SELECT account_id, created_at, last_access_at FROM sessions WHERE token_hash = $1",
    [hash],
  );
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
  return { id: token, accountId: row.account_id };
}

/** 呼び出し側は sessionCookie() で Cookie を返すこと。 */
export async function createSession(accountId: number): Promise<Session> {
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
    [await hashToken(token), accountId, new Date(now)],
  );
  return { id: token, accountId };
}

export async function destroySession(session: Session): Promise<void> {
  await db.query("DELETE FROM sessions WHERE token_hash = $1", [await hashToken(session.id)]);
}

/** 呼び出し側は clearSessionCookie() で Cookie を消すこと。 */
export async function logout(session: Session, remoteAddress: string | undefined): Promise<void> {
  await destroySession(session);
  audit("logged_out", { accountId: session.accountId, remoteAddress });
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

/**
 * DB にはトークンのハッシュだけを保存する。DB やバックアップが漏れても、そこからログインできないようにするため。
 * トークンは 256 ビットのランダムな値なので、ソルトや遅いハッシュは要らない。
 */
async function hashToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return new Uint8Array(digest).toBase64({ alphabet: "base64url", omitPadding: true });
}
