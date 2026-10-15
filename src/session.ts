/**
 * ログイン中のセッション。ログインに成功したときだけ作るため、ログインしていない利用者が DB を増やすことはできない。
 */
import { clearHostCookie, hostCookie, readCookie } from "./cookie.ts";
import { randomToken } from "./crypto.ts";
import { db } from "./db.ts";
import { SESSION_ABSOLUTE_TIMEOUT_MINUTES, SESSION_IDLE_TIMEOUT_MINUTES } from "./env.ts";

const COOKIE_NAME = "__Host-sid";
const IDLE_TIMEOUT_MS = SESSION_IDLE_TIMEOUT_MINUTES * 60 * 1000;
const ABSOLUTE_TIMEOUT_MS = SESSION_ABSOLUTE_TIMEOUT_MINUTES * 60 * 1000;
/** リクエストのたびに DB へ書き込まないよう、最終アクセス時刻はこの間隔より古くなったときだけ更新する。 */
const TOUCH_INTERVAL_MS = 60 * 1000;
const SWEEP_INTERVAL_MS = 60 * 1000;

/** id は Cookie に入れるトークンそのもの。ログや DB に書かないこと。 */
export type Session = { readonly id: string; readonly accountId: number };

type SessionRow = { account_id: number; created_at: number; last_access_at: number };

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
  const row = db
    .prepare("SELECT account_id, created_at, last_access_at FROM sessions WHERE token_hash = ?")
    .get(hash) as SessionRow | undefined;
  if (!row) return undefined;
  const now = Date.now();
  if (isExpired(row, now)) {
    db.prepare("DELETE FROM sessions WHERE token_hash = ?").run(hash);
    return undefined;
  }
  if (now - row.last_access_at >= TOUCH_INTERVAL_MS) {
    db.prepare("UPDATE sessions SET last_access_at = ? WHERE token_hash = ?").run(now, hash);
  }
  return { id: token, accountId: row.account_id };
}

/** 呼び出し側は sessionCookie() で Cookie を返すこと。 */
export async function createSession(accountId: number): Promise<Session> {
  const now = Date.now();
  if (now >= nextSweepAt) {
    // isExpired() と同じ条件。タイムアウトが 0 の条件は使わない
    db.prepare(
      "DELETE FROM sessions WHERE (? > 0 AND last_access_at <= ?) OR (? > 0 AND created_at <= ?)",
    ).run(IDLE_TIMEOUT_MS, now - IDLE_TIMEOUT_MS, ABSOLUTE_TIMEOUT_MS, now - ABSOLUTE_TIMEOUT_MS);
    nextSweepAt = now + SWEEP_INTERVAL_MS;
  }
  const token = randomToken();
  db.prepare(
    "INSERT INTO sessions (token_hash, account_id, created_at, last_access_at) VALUES (?, ?, ?, ?)",
  ).run(await hashToken(token), accountId, now, now);
  return { id: token, accountId };
}

export async function destroySession(session: Session): Promise<void> {
  db.prepare("DELETE FROM sessions WHERE token_hash = ?").run(await hashToken(session.id));
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
  return (IDLE_TIMEOUT_MS > 0 && now - row.last_access_at >= IDLE_TIMEOUT_MS) ||
    (ABSOLUTE_TIMEOUT_MS > 0 && now - row.created_at >= ABSOLUTE_TIMEOUT_MS);
}

/**
 * DB にはトークンのハッシュだけを保存する。DB やバックアップが漏れても、そこからログインできないようにするため。
 * トークンは 256 ビットのランダムな値なので、ソルトや遅いハッシュは要らない。
 */
async function hashToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return new Uint8Array(digest).toBase64({ alphabet: "base64url", omitPadding: true });
}
