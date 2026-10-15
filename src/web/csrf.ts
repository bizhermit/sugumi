/**
 * トークンはサーバーに保存せず、照合先の値を HMAC で署名して作る。
 * 照合先はログイン中ならセッション ID、ログイン前は専用の Cookie の値にしている。
 * ログイン画面を開かれるだけでサーバーのメモリを使わないようにするため。
 *
 * GET・HEAD・OPTIONS 以外のリクエストは、app.ts がページより先に verify() で検証する。
 * そのため GET などでは状態を変えないこと。
 */
import { clearHostCookie, hostCookie, readCookie } from "../lib/cookie.ts";
import { randomToken, timingSafeEqual } from "../lib/crypto.ts";
import { secret } from "../lib/db.ts";
import { PRE_LOGIN_CSRF_TIMEOUT_MINUTES } from "../lib/env.ts";
import { escapeHtml } from "../lib/html.ts";
import type { Session } from "../lib/auth/session.ts";

const FIELD_NAME = "_csrf";
const HEADER_NAME = "x-csrf-token";
const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);
const PRE_LOGIN_COOKIE = "__Host-csrf";
const PRE_LOGIN_TTL_MS = PRE_LOGIN_CSRF_TIMEOUT_MINUTES * 60 * 1000;

// 鍵は DB に保存し、再起動の前に表示したフォームも送信できるようにしている。
// トークンは照合先のセッション ID か Cookie の値も知らなければ作れないため、DB が漏れただけでは偽造できない。
const KEY = await crypto.subtle.importKey(
  "raw",
  secret("csrf_hmac_key", 32),
  { name: "HMAC", hash: "SHA-256" },
  false,
  ["sign"],
);

export type Csrf = {
  /** ログイン前の Cookie が送られてきたが、期限切れか不正だったとき true。 */
  readonly stale: boolean;
  /** 照合先がなければログイン前の Cookie を発行し、applyCookie() でレスポンスに載せる。 */
  token(): Promise<string>;
  /** トークンはフォームの `_csrf` か、fetch から送る場合は `X-CSRF-Token` ヘッダーで受け取る。 */
  verify(req: Request): Promise<boolean>;
  applyCookie(res: Response): Response;
};

export function csrfFor(req: Request, session: Session | undefined): Csrf {
  const raw = readCookie(req, PRE_LOGIN_COOKIE);
  const preLogin = raw !== undefined && isFresh(raw, Date.now()) ? raw : undefined;
  const binding = session ? `session:${session.id}` : preLogin && `pre:${preLogin}`;
  let issued: string | undefined;
  return {
    stale: raw !== undefined && preLogin === undefined,
    token() {
      if (binding !== undefined) return sign(binding);
      issued ??= `${Date.now()}.${randomToken()}`;
      return sign(`pre:${issued}`);
    },
    async verify(req) {
      if (SAFE_METHODS.has(req.method)) return true;
      if (binding === undefined) return false;
      const token = req.headers.get(HEADER_NAME) ?? await readFormToken(req);
      return token !== undefined && timingSafeEqual(token, await sign(binding));
    },
    applyCookie(res) {
      if (issued === undefined) return res;
      const out = new Response(res.body, res);
      out.headers.append("set-cookie", hostCookie(PRE_LOGIN_COOKIE, issued));
      return out;
    },
  };
}

/**
 * ログインしたら返すこと。残しておくと、セッションが切れたあとにログイン前のトークンと照合され、
 * 期限切れではなく 403 として扱われる。
 */
export function clearPreLoginCookie(): string {
  return clearHostCookie(PRE_LOGIN_COOKIE);
}

/** フォームの中に置く hidden input。 */
export function csrfInput(token: string): string {
  return `<input type="hidden" name="${FIELD_NAME}" value="${escapeHtml(token)}">`;
}

function isFresh(value: string, now: number): boolean {
  const issuedAt = Number(value.match(/^(\d{1,16})\.[A-Za-z0-9_-]{43}$/)?.[1]);
  return now - issuedAt >= 0 && (PRE_LOGIN_TTL_MS === 0 || now - issuedAt < PRE_LOGIN_TTL_MS);
}

async function sign(binding: string): Promise<string> {
  const mac = await crypto.subtle.sign("HMAC", KEY, new TextEncoder().encode(binding));
  return new Uint8Array(mac).toBase64({ alphabet: "base64url", omitPadding: true });
}

async function readFormToken(req: Request): Promise<string | undefined> {
  const type = req.headers.get("content-type") ?? "";
  if (!/^(?:application\/x-www-form-urlencoded|multipart\/form-data)\b/i.test(type)) {
    return undefined;
  }
  try {
    // 複製して読むため、ページ側でも req.formData() を呼べる
    const value = (await req.clone().formData()).get(FIELD_NAME);
    return typeof value === "string" ? value : undefined;
  } catch {
    return undefined;
  }
}
