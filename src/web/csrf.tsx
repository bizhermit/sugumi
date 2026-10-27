/**
 * トークンはサーバーに保存せず、紐付け先の値を HMAC で署名して作る。
 * 紐付け先は、ログイン中ならセッション ID、ログイン前なら専用の Cookie の値。
 * サーバーに保存しないので、ログイン画面を開かれるだけではサーバーのメモリを使わない。
 *
 * GET・HEAD・OPTIONS 以外のリクエストは、app.ts がページより先に verify() で検証する。
 * GET などは検証しないので、状態を変えないこと。
 */
import { clearHostCookie, hostCookie, readCookie } from "../lib/cookie.ts";
import { randomToken, timingSafeEqual } from "../lib/crypto.ts";
import { secret } from "../lib/db.ts";
import { PRE_LOGIN_CSRF_TIMEOUT_MINUTES } from "../lib/env.ts";
import { parseForm } from "./form.ts";
import { editHeaders } from "./response.ts";
import type { Session } from "../lib/auth/session.ts";
import type { Html } from "../lib/jsx-runtime.ts";

const FIELD_NAME = "_csrf";
const HEADER_NAME = "x-csrf-token";
const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);
const PRE_LOGIN_COOKIE = "__Host-csrf";
const PRE_LOGIN_TTL_MS = PRE_LOGIN_CSRF_TIMEOUT_MINUTES * 60 * 1000;

// 鍵は DB に保存して、再起動の前に表示したフォームも送信できるようにしている。
// トークンを作るには紐付け先のセッション ID か Cookie の値も要るので、DB が漏れただけでは偽造できない。
const KEY = await crypto.subtle.importKey(
  "raw",
  await secret("csrf_hmac_key", 32),
  { name: "HMAC", hash: "SHA-256" },
  false,
  ["sign"],
);

// リクエストごとに作るので、メソッドを毎回作らずに済むようクラスにしている。
class Csrf {
  /** ログイン前の Cookie は送られてきたが、期限切れか不正だったときに true。 */
  readonly stale: boolean;
  readonly #binding: string | undefined;
  #issued: string | undefined;
  #used = false;
  // トークンは紐付け先だけで決まるので、1 ページに複数のフォームがあっても署名は 1 回で済ませる。
  #token: Promise<string> | undefined;

  constructor(req: Request, session: Session | undefined) {
    const raw = readCookie(req, PRE_LOGIN_COOKIE);
    const preLogin = raw !== undefined && isFresh(raw, Date.now()) ? raw : undefined;
    this.#binding = session ? `session:${session.id}` : preLogin && `pre:${preLogin}`;
    this.stale = raw !== undefined && preLogin === undefined;
  }

  /**
   * フォームに埋め込むトークンを返す。何度呼んでも同じ値を返す。
   * 紐付け先がなければログイン前の Cookie を発行し、apply() でレスポンスに載せる。
   */
  token(): Promise<string> {
    this.#used = true;
    return this.#token ??= this.#sign();
  }

  /**
   * req のトークンが正しければ true を返す。GET・HEAD・OPTIONS は常に true。
   * トークンは、フォームなら `_csrf` で、fetch で送るなら `X-CSRF-Token` ヘッダーで受け取る。
   */
  async verify(req: Request): Promise<boolean> {
    if (SAFE_METHODS.has(req.method)) return true;
    if (this.#binding === undefined) return false;
    const token = req.headers.get(HEADER_NAME) ?? await readFormToken(req);
    // 検証に失敗したページがフォームを表示し直すときに署名し直さずに済むよう、token() と同じ値を使う。
    return token !== undefined && timingSafeEqual(token, await (this.#token ??= this.#sign()));
  }

  /**
   * token() で発行した Cookie を res に載せる。
   * token() を呼んでいれば、ページが何を指定していても cache-control を no-store にする。
   */
  apply(res: Response): Response {
    if (!this.#used) return res;
    return editHeaders(res, stampUsed, this.#issued);
  }

  #sign(): Promise<string> {
    if (this.#binding !== undefined) return sign(this.#binding);
    this.#issued = `${Date.now()}.${randomToken()}`;
    return sign(`pre:${this.#issued}`);
  }
}
export type { Csrf };

/**
 * リクエストごとに 1 つ作り、検証・トークンの発行・Cookie の付与に使う。app.ts から呼ぶ。
 * ページは、これを使わずに ctx.csrfToken() でトークンを受け取る。
 * session には、そのリクエストのセッションを渡す（ログインしていなければ undefined）。
 */
export function csrfFor(req: Request, session: Session | undefined): Csrf {
  return new Csrf(req, session);
}

/**
 * ログイン前の Cookie を消す Set-Cookie の値を返す。ログインに成功したレスポンスに付けること。
 * 残しておくと、セッションが切れたあとの送信がログイン前のトークンと比べられ、期限切れではなく 403 になる。
 */
export function clearPreLoginCookie(): string {
  return clearHostCookie(PRE_LOGIN_COOKIE);
}

/**
 * CSRF のトークンを送る hidden input を返す。GET 以外で送信するフォームの中に置く。
 * token には ctx.csrfToken() の値を渡す。
 */
export function CsrfInput({ token }: { token: string }): Html {
  return <input type="hidden" name={FIELD_NAME} value={token} />;
}

/** issued は token() で発行したログイン前の Cookie の値。 */
function stampUsed(headers: Headers, issued: string | undefined) {
  // トークンはセッションに紐付いている。共有キャッシュに残ると別のユーザーにトークンが渡り、
  // ブラウザのキャッシュに残ると、セッションが変わったあとの送信が失敗する。
  headers.set("cache-control", "no-store");
  if (issued !== undefined) headers.append("set-cookie", hostCookie(PRE_LOGIN_COOKIE, issued));
}

function isFresh(value: string, now: number) {
  const issuedAt = Number(value.match(/^(\d{1,16})\.[A-Za-z0-9_-]{43}$/)?.[1]);
  return now - issuedAt >= 0 && (PRE_LOGIN_TTL_MS === 0 || now - issuedAt < PRE_LOGIN_TTL_MS);
}

const encoder = new TextEncoder();

async function sign(binding: string) {
  const mac = await crypto.subtle.sign("HMAC", KEY, encoder.encode(binding));
  return new Uint8Array(mac).toBase64({ alphabet: "base64url", omitPadding: true });
}

async function readFormToken(req: Request): Promise<string | undefined> {
  const value = (await parseForm(req))?.get(FIELD_NAME);
  return typeof value === "string" ? value : undefined;
}
