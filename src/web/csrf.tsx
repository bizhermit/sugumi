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
import { parseForm } from "./form.ts";
import { editHeaders } from "./response.ts";
import type { Session } from "../lib/auth/session.ts";
import type { Html } from "../lib/jsx-runtime.ts";

const FIELD_NAME = "_csrf";
const HEADER_NAME = "x-csrf-token";
const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);
const PRE_LOGIN_COOKIE = "__Host-csrf";
const PRE_LOGIN_TTL_MS = PRE_LOGIN_CSRF_TIMEOUT_MINUTES * 60 * 1000;

// 鍵は DB に保存し、再起動の前に表示したフォームも送信できるようにしている。
// トークンは照合先のセッション ID か Cookie の値も知らなければ作れないため、DB が漏れただけでは偽造できない。
const KEY = await crypto.subtle.importKey(
  "raw",
  await secret("csrf_hmac_key", 32),
  { name: "HMAC", hash: "SHA-256" },
  false,
  ["sign"],
);

// リクエストごとに作るため、メソッドを関数として毎回作らないようクラスにしている
class Csrf {
  /** ログイン前の Cookie が送られてきたが、期限切れか不正だったとき true。 */
  readonly stale: boolean;
  readonly #binding: string | undefined;
  #issued: string | undefined;
  #used = false;
  // トークンは照合先だけで決まるため、1 ページに複数のフォームがあっても署名は 1 回にする
  #token: Promise<string> | undefined;

  constructor(req: Request, session: Session | undefined) {
    const raw = readCookie(req, PRE_LOGIN_COOKIE);
    const preLogin = raw !== undefined && isFresh(raw, Date.now()) ? raw : undefined;
    this.#binding = session ? `session:${session.id}` : preLogin && `pre:${preLogin}`;
    this.stale = raw !== undefined && preLogin === undefined;
  }

  /** 照合先がなければログイン前の Cookie を発行し、apply() でレスポンスに載せる。何度呼んでも同じ値を返す。 */
  token(): Promise<string> {
    this.#used = true;
    return this.#token ??= this.#sign();
  }

  /** トークンはフォームの `_csrf` か、fetch から送る場合は `X-CSRF-Token` ヘッダーで受け取る。 */
  async verify(req: Request): Promise<boolean> {
    if (SAFE_METHODS.has(req.method)) return true;
    if (this.#binding === undefined) return false;
    const token = req.headers.get(HEADER_NAME) ?? await readFormToken(req);
    // 検証に失敗したページでフォームを出し直すときも、署名をし直さずに済むよう token() と共有する
    return token !== undefined && timingSafeEqual(token, await (this.#token ??= this.#sign()));
  }

  /**
   * token() で発行した Cookie を載せる。token() を呼んでいれば、ページの指定によらず cache-control を no-store にする。
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

export function csrfFor(req: Request, session: Session | undefined): Csrf {
  return new Csrf(req, session);
}

/**
 * ログインしたら返すこと。残しておくと、セッションが切れたあとにログイン前のトークンと照合され、
 * 期限切れではなく 403 として扱われる。
 */
export function clearPreLoginCookie(): string {
  return clearHostCookie(PRE_LOGIN_COOKIE);
}

/** フォームの中に置く hidden input。 */
export function CsrfInput({ token }: { token: string }): Html {
  return <input type="hidden" name={FIELD_NAME} value={token} />;
}

/** issued は token() で発行したログイン前の Cookie の値。 */
function stampUsed(headers: Headers, issued: string | undefined) {
  // トークンはセッションに結び付いているため、共有キャッシュに残ると別の利用者にトークンが渡り、
  // ブラウザのキャッシュに残るとセッションが変わったあとの送信が失敗する
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

async function readFormToken(req: Request) {
  const value = (await parseForm(req))?.get(FIELD_NAME);
  return typeof value === "string" ? value : undefined;
}
