import { randomBytes, timingSafeEqual } from "node:crypto";
import { hostCookie, readCookie } from "./cookie.ts";
import { slot } from "./slot.ts";

/**
 * CSRF対策は二段構え。ルートの処理前に両方実行する。
 * 1. isSameOrigin: ブラウザが設定するヘッダでリクエスト元を検証する
 * 2. verifyCsrfToken: Cookieのトークンとフォームの`_csrf`を検証する
 */

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);
const COOKIE_NAME = "csrf";
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/; // 32バイトのbase64url
export const CSRF_FIELD_NAME = "_csrf";

export const csrfSlot = slot<string>("csrf");

export function isSafeMethod(method: string): boolean {
  return SAFE_METHODS.has(method);
}

export function isSameOrigin(req: Request): boolean {
  if (SAFE_METHODS.has(req.method)) return true;

  const site = req.headers.get("sec-fetch-site");
  if (site != null) {
    return site === "same-origin" || site === "none";
  }

  // 付けないクライアントはOriginとHostを比べる。
  // スキームはリバースプロキシが付けるX-Forwarded-Protoに従う。
  const origin = req.headers.get("origin");
  const host = req.headers.get("host");
  if (origin == null || host == null) return false;
  const proto = req.headers.get("x-forwarded-proto") ?? "http";
  return origin === `${proto}://${host}`;
}

export function readCsrfToken(req: Request): string | undefined {
  const value = readCookie(req, COOKIE_NAME);
  return value != null && TOKEN_PATTERN.test(value) ? value : undefined;
}

export function createCsrfToken(): string {
  return randomBytes(32).toString("base64url");
}

export function createCsrfCookie(token: string): string {
  return hostCookie(COOKIE_NAME, token);
}

export function verifyCsrfToken(form: FormData, token: string | undefined): boolean {
  const submitted = form.get(CSRF_FIELD_NAME);
  if (token == null || typeof submitted !== "string" || submitted.length !== token.length) {
    return false;
  }
  return timingSafeEqual(Buffer.from(submitted), Buffer.from(token));
}
