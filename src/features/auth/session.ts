import { createHash, randomBytes } from "node:crypto";
import type { DataBase } from "../../lib/db.ts";
import { clearHostCookie, hostCookie, readCookie } from "../../web/cookie.ts";
import { slot } from "../../web/slot.ts";
import type { LoginAccount } from "./login-account.ts";

const COOKIE_NAME = "session";
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/; // 32バイトのbase64url
const IDLE_TIMEOUT_MS = 30 * 60 * 1000;
const ABSOLUTE_TIMEOUT_MS = 12 * 60 * 60 * 1000;
const TOUCH_INTERVAL_MS = 60 * 1000;

export type Session = {
  readonly token: string; // Cookieに入れるトークン。ログやDBに書き込んではならない
  readonly account: LoginAccount;
};

type SessionRow = {
  readonly created_at: Date;
  readonly last_access_at: Date;
  readonly id: number;
  readonly username: string;
  readonly display_name: string;
};

export const sessionSlot = slot<Session>("session");

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("base64url");
}

function isExpired(row: SessionRow, now: number): boolean {
  return now - row.last_access_at.getTime() >= IDLE_TIMEOUT_MS || now - row.created_at.getTime() >= ABSOLUTE_TIMEOUT_MS;
}

const selectSessionSql = `
SELECT
  sessions.created_at
, sessions.last_access_at
, accounts.id
, accounts.username
, accounts.display_name
FROM
  sessions
  JOIN accounts
    ON accounts.id = sessions.account_id
WHERE
  sessions.token_hash = $1
`;

export async function findSession(db: DataBase, req: Request): Promise<Session | undefined> {
  const token = readCookie(req, COOKIE_NAME);
  if (token == null || !TOKEN_PATTERN.test(token)) return undefined;
  const tokenHash = hashToken(token);
  const { rows } = await db.query<SessionRow>(selectSessionSql, [tokenHash]);
  const row = rows[0];
  if (row == null) return undefined;
  const now = Date.now();
  if (isExpired(row, now)) {
    await db.query("DELETE FROM sessions WHERE token_hash = $1", [tokenHash]);
    return undefined;
  }
  if (now - row.last_access_at.getTime() >= TOUCH_INTERVAL_MS) {
    await db.query("UPDATE sessions SET last_access_at = $1 WHERE token_hash = $2", [new Date(now), tokenHash]);
  }
  return { token, account: { id: row.id, username: row.username, displayName: row.display_name } };
}

const deleteExpiredSessionsSql = `
DELETE FROM sessions
WHERE
     last_access_at <= $1
  OR created_at <= $2
`;

const insertSessionSql = `
INSERT INTO sessions (
  token_hash
, account_id
, created_at
, last_access_at
) VALUES ($1, $2, $3, $3)
`;

export async function createSession(db: DataBase, accountId: number): Promise<string> {
  const now = new Date();
  await db.query(deleteExpiredSessionsSql, [
    new Date(now.getTime() - IDLE_TIMEOUT_MS),
    new Date(now.getTime() - ABSOLUTE_TIMEOUT_MS),
  ]);
  const token = randomBytes(32).toString("base64url");
  await db.query(insertSessionSql, [hashToken(token), accountId, now]);
  return token;
}

export async function deleteSession(db: DataBase, token: string): Promise<void> {
  await db.query("DELETE FROM sessions WHERE token_hash = $1", [hashToken(token)]);
}

export function hasSessionCookie(req: Request): boolean {
  return readCookie(req, COOKIE_NAME) != null;
}

export function sessionCookie(token: string): string {
  return hostCookie(COOKIE_NAME, token);
}

export function clearSessionCookie(): string {
  return clearHostCookie(COOKIE_NAME);
}
