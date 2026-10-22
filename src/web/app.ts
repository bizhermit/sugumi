import { ASSETS_PREFIX, serveAsset } from "./assets.ts";
import { type Csrf, csrfFor } from "./csrf.tsx";
import { errorPage, methodNotAllowed } from "./error-page.tsx";
import { InvalidFormError, parseForm } from "./form.ts";
import { loadRouter, type RouteContext } from "./router.ts";
import { withSecurityHeaders } from "./security-headers.ts";
import { loadStatic, type StaticFiles } from "./static.ts";
import {
  clearSessionCookie,
  getSession,
  hasSessionCookie,
  type Session,
} from "../lib/auth/session.ts";
import { isDbTimeout } from "../lib/db.ts";
import { REQUEST_BODY_TIMEOUT_SECONDS } from "../lib/env.ts";
import { path, redirect } from "./url.ts";
import { remoteAddressOf } from "./remote-address.ts";
import type { RoutePath } from "../routes.gen.ts";

// Deno の req.url は Host ヘッダーを検証せずに連結して作られるため、
// Host に `/` や `#` を含めると URL として解析したときの pathname を差し替えられる。
const VALID_HOST = /^(?:[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*|\[[0-9A-Fa-f:.]+\])(?::\d{1,5})?$/;

// ファイルのアップロードなど大きな本文を受けるルートを作るときは、ルートごとに上限を変えられるようにすること
const MAX_BODY_BYTES = 1024 * 1024;

// 締め切りを過ぎて読むのをやめた本文の reader。
// リクエストごとに関数を作らないよう、setTimeout にはモジュールの expireBody() と reader を渡し、結果はここに残す
const expiredBodies = new WeakSet<ReadableStreamDefaultReader<Uint8Array>>();

// ctx.session が常に undefined になるため、src/routes/before.tree.ts の PUBLIC_ROUTES にも入れること
const SESSIONLESS_ROUTES: ReadonlySet<RoutePath> = new Set<RoutePath>(["/healthz"]);

// ページの Response のヘッダーはその場で書き足す（response.ts）。同じ Response を使い回すページがあると、
// 前のリクエストで足した Cookie などが次の利用者に渡るため、2 回目は書き足す前に例外にする
const claimed = new WeakSet<Response>();

export type Handler = (req: Request, info?: Deno.ServeHandlerInfo) => Promise<Response>;
type Router = Awaited<ReturnType<typeof loadRouter>>;

/**
 * ルートと静的ファイルを読み込み、Deno.serve に渡すハンドラを返す。
 * routes・staticDir は既定で src/routes/・static/ で、テストで別のディレクトリを渡す。
 * bodyTimeoutMs は既定で REQUEST_BODY_TIMEOUT_SECONDS で、テストで短い値を渡す。
 * 静的ファイルがルートか /assets/ と同じ URL になる場合は例外を投げる。
 */
export async function createApp(
  { mock, routes, staticDir, bodyTimeoutMs = REQUEST_BODY_TIMEOUT_SECONDS * 1000 }: {
    mock: boolean;
    routes?: URL;
    staticDir?: URL;
    bodyTimeoutMs?: number;
  },
): Promise<Handler> {
  const match = await loadRouter({ mock, root: routes });
  const statics = await loadStatic(staticDir);

  // 静的ファイルはルーターより先に引くため、同じ URL に照合するルートがあると、そのルートに届かなくなる
  for (const pathname of statics.paths()) {
    if (pathname.startsWith(ASSETS_PREFIX) || match(pathname, "GET")) {
      throw new Error(
        `static${decodeURIComponent(pathname)}: ルートか /assets/ と同じ URL になります`,
      );
    }
  }

  return async (req, info) => {
    const addr = info?.remoteAddr;
    const tcpAddress = addr && "hostname" in addr ? addr.hostname : undefined;
    let res: Response;
    try {
      res = await handle(match, statics, req, tcpAddress, bodyTimeoutMs);
    } catch (e) {
      // Deno の既定の 500 にはセキュリティヘッダーが付かないため、ページの外の例外もここで受ける
      console.error(e);
      // DB の混雑は待てば直るため、プロキシやクライアントがやり直せるよう 500 と分ける
      res = errorPage(isDbTimeout(e) ? 503 : 500);
    }
    return withSecurityHeaders(res);
  };
}

async function handle(
  match: Router,
  statics: StaticFiles,
  req: Request,
  tcpAddress: string | undefined,
  bodyTimeoutMs: number,
): Promise<Response> {
  const host = req.headers.get("host");
  if (host !== null && !VALID_HOST.test(host)) return errorPage(400);
  let url: URL;
  try {
    url = new URL(req.url);
  } catch {
    return errorPage(400);
  }
  if (url.hash !== "") return errorPage(400);
  // 静的ファイルはログインの有無で内容が変わらないため、セッションや CSRF を確かめない
  if (url.pathname.startsWith(ASSETS_PREFIX)) return serveAsset(req, url);
  const staticFile = statics.serve(req, url);
  if (staticFile) return staticFile;

  const route = match(url.pathname, req.method);
  if (!route) return errorPage(404);
  const { handler: pageHandler } = route;
  if (!pageHandler) return methodNotAllowed(route.allow);
  const buffered = await bufferBody(req, MAX_BODY_BYTES, bodyTimeoutMs);
  if (typeof buffered === "number") return errorPage(buffered);

  // ヘルスチェックは DB が止まっていても応答させるため、Cookie が付いていてもセッションを引かない
  const session = SESSIONLESS_ROUTES.has(route.route) ? undefined : await getSession(buffered);
  const csrf = csrfFor(buffered, session);
  if (!(await csrf.verify(buffered))) {
    if (session) return errorPage(403);
    // セッションがなければ書き換えられる状態もないため、期限切れ後の送信などはやり直せるようにする
    const staleSession = hasSessionCookie(buffered);
    const res = redirect(
      path("/login", { query: { expired: staleSession || csrf.stale ? 1 : null } }),
      303,
    );
    if (staleSession) res.headers.append("set-cookie", clearSessionCookie());
    return res;
  }

  let res: Response;
  try {
    res = await pageHandler(
      buffered,
      new Context(route.route, route.params, session, buffered, url, csrf, tcpAddress),
    );
  } catch (e) {
    if (e instanceof InvalidFormError) return errorPage(400);
    throw e;
  }
  if (claimed.has(res)) {
    throw new Error(
      `${route.route}: 同じ Response を 2 回返しました。リクエストごとに作ってください`,
    );
  }
  claimed.add(res);
  return csrf.apply(res);
}

/**
 * 本文を上限まで読み込み、何度でも読める Request にして返す。
 * 上限を超えたら 413、timeoutMs ミリ秒で読み終わらなければ 408 を返す。
 * Content-Length は省略や偽装ができるため、実際に読んだ量でも判定する。
 */
async function bufferBody(
  req: Request,
  limit: number,
  timeoutMs: number,
): Promise<Request | 408 | 413> {
  if (req.body === null) return req;
  if (Number(req.headers.get("content-length")) > limit) return 413;
  const reader = req.body.getReader();
  // 締め切りは塊ごとではなく本文全体に付ける。塊ごとだと、1 バイトずつ送り続ける接続を止められない
  const timer = setTimeout(expireBody, timeoutMs, reader);
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (expiredBodies.has(reader)) return 408;
      if (done) break;
      size += value.byteLength;
      if (size > limit) {
        await reader.cancel();
        return 413;
      }
      chunks.push(value);
    }
  } finally {
    clearTimeout(timer);
  }
  // 小さな本文はほとんど 1 つの塊で届くため、そのときは複製しない。
  // Content-Length で先に確保すると、大きく宣言して少しだけ送る接続ごとにメモリを確保させられるため、届いた分だけ使う
  // Deno の本文の塊は ArrayBuffer の上にあるが、ストリームの型は SharedArrayBuffer も含むため型を絞る
  if (chunks.length === 1) return new Request(req, { body: chunks[0] as Uint8Array<ArrayBuffer> });
  const body = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new Request(req, { body });
}

/** 読み込み中の read() を done で終わらせ、bufferBody() に 408 を返させる。 */
function expireBody(reader: ReadableStreamDefaultReader<Uint8Array>): void {
  expiredBodies.add(reader);
  // 取り消しの失敗は応答に関わらないが、捨てずにログに残す
  reader.cancel().catch(console.error);
}

/**
 * ページに渡す ctx。リクエストごとに作るため、ページが使わない値（IP アドレスの解析など）は読まれたときに作る。
 * 関数の値は、分割代入で取り出してから呼んでも動くよう、this を使わないものを読まれたときに作る。
 */
class Context implements RouteContext {
  readonly #req: Request;
  readonly #url: URL;
  readonly #csrf: Csrf;
  readonly #tcpAddress: string | undefined;
  #remoteAddress: string | undefined;
  #remoteAddressResolved = false;
  #csrfToken: (() => Promise<string>) | undefined;
  #form: (() => Promise<FormData>) | undefined;

  constructor(
    readonly route: RouteContext["route"],
    readonly params: Record<string, string>,
    readonly session: Session | undefined,
    req: Request,
    url: URL,
    csrf: Csrf,
    tcpAddress: string | undefined,
  ) {
    this.#req = req;
    this.#url = url;
    this.#csrf = csrf;
    this.#tcpAddress = tcpAddress;
  }

  get query(): URLSearchParams {
    return this.#url.searchParams;
  }

  get remoteAddress(): string | undefined {
    if (!this.#remoteAddressResolved) {
      this.#remoteAddress = remoteAddressOf(this.#req, this.#tcpAddress);
      this.#remoteAddressResolved = true;
    }
    return this.#remoteAddress;
  }

  get csrfToken(): () => Promise<string> {
    return this.#csrfToken ??= () => this.#csrf.token();
  }

  get form(): () => Promise<FormData> {
    return this.#form ??= () => formOf(this.#req);
  }
}

async function formOf(req: Request): Promise<FormData> {
  const form = await parseForm(req);
  if (!form) throw new InvalidFormError();
  return form;
}
