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
import { logError, writeLog } from "../lib/log.ts";
import { REQUEST_BODY_TIMEOUT_SECONDS } from "../lib/env.ts";
import { path, redirect } from "./url.ts";
import { remoteAddressOf } from "./remote-address.ts";
import type { RoutePath } from "../routes.gen.ts";

// Deno の req.url は、Host ヘッダーを検証せずに連結して作られる。
// そのため Host に `/` や `#` を含めると、URL としてパースしたときの pathname を差し替えられる。
const VALID_HOST = /^(?:[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*|\[[0-9A-Fa-f:.]+\])(?::\d{1,5})?$/;

// ファイルのアップロードなど、大きなリクエストボディを受けるルートを作るときは、ルートごとに上限を変えられるようにすること。
const MAX_BODY_BYTES = 1024 * 1024;

// タイムアウトして読むのをやめたリクエストボディの reader。
// リクエストごとに関数を作らないよう、setTimeout にはモジュールの expireBody() と reader を渡し、結果はここに残す。
const expiredBodies = new WeakSet<ReadableStreamDefaultReader<Uint8Array>>();

// ここに入れたルートは ctx.session が常に undefined になるので、src/routes/before.tree.ts の PUBLIC_ROUTES にも入れること。
const SESSIONLESS_ROUTES: ReadonlySet<RoutePath> = new Set<RoutePath>(["/healthz"]);

// ページが返した Response のヘッダーには、その場で追加する（response.ts）。同じ Response を使い回すページがあると、
// 前のリクエストで追加した Cookie などが次のユーザーに渡ってしまう。そこで 2 回目は、追加する前に例外にする。
const claimed = new WeakSet<Response>();

// どのルートにもマッチしない長い URL を送り続けて、ログをあふれさせることができないようにする。
const MAX_LOGGED_PATH_LENGTH = 1024;

// Deno はメソッド名をほぼ無制限（約 60 KB まで）に受け付ける。そのままログに出すと、1 回のリクエストで
// 長い行を書き込んでログをあふれさせたり、Docker に行を分割させて「1 行に 1 つの JSON」を崩したりできてしまう。
// そのため、ここにないメソッドは OTHER にまとめる。
const LOGGED_METHODS: ReadonlySet<string> = new Set([
  "GET",
  "HEAD",
  "POST",
  "PUT",
  "PATCH",
  "DELETE",
  "OPTIONS",
  "CONNECT",
  "TRACE",
]);

/**
 * 1 リクエストにつき 1 行出すアクセスログ。キーを先に揃えておき、handle() が分かった値から埋めていく。
 * クエリ文字列・Cookie・リクエストボディは出さない。ログイン後の戻り先やトークンが入るため。
 * time はほかのログと同じく書き出した時刻。durationMs は Response を返すまでの時間で、レスポンスボディを送り終えるまでではない。
 */
type AccessLog = {
  type: "access";
  time: string;
  requestId: string;
  /** LOGGED_METHODS にないメソッドは OTHER。 */
  method: string;
  /** pathname。URL としてパースできなければ undefined。 */
  path: string | undefined;
  /** マッチしたルートのパターン。どのルートにもマッチしなければ undefined。 */
  route: RoutePath | undefined;
  status: number;
  durationMs: number;
  remoteAddress: string | undefined;
  /** ログインしていれば、そのアカウントの ID。 */
  accountId: number | undefined;
  /** ログインしていれば、そのセッションの logId。監査ログの login_succeeded と突き合わせて、どのログインによるリクエストかを調べる。 */
  sessionLogId: string | undefined;
};

export type Handler = (req: Request, info?: Deno.ServeHandlerInfo) => Promise<Response>;
type Router = Awaited<ReturnType<typeof loadRouter>>;

/**
 * ルートと静的ファイルを読み込み、Deno.serve に渡すハンドラを返す。
 * routes・staticDir のデフォルトは src/routes/・static/ で、テストでは別のディレクトリを渡す。
 * bodyTimeoutMs のデフォルトは REQUEST_BODY_TIMEOUT_SECONDS で、テストでは短い値を渡す。
 * 静的ファイルがルートか /assets/ と同じ URL になるときは、例外を投げる。
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

  // 静的ファイルはルーターより先に探すので、同じ URL のルートがあっても、そのルートには届かない。
  for (const pathname of statics.paths()) {
    if (pathname.startsWith(ASSETS_PREFIX) || match(pathname, "GET")) {
      throw new Error(
        `static${decodeURIComponent(pathname)}: ルートか /assets/ と同じ URL になります`,
      );
    }
  }

  return async (req, info) => {
    const start = performance.now();
    const addr = info?.remoteAddr;
    const tcpAddress = addr && "hostname" in addr ? addr.hostname : undefined;
    // 静的ファイルのリクエストもログに出す。/assets/ はブラウザにずっとキャッシュされ、static/ は 304 で済むので量は少ない。
    // 出しておけば、存在しないファイルを探して回る接続元も追える。
    const log: AccessLog = {
      type: "access",
      time: "",
      requestId: crypto.randomUUID(),
      method: LOGGED_METHODS.has(req.method) ? req.method : "OTHER",
      path: undefined,
      route: undefined,
      status: 0,
      durationMs: 0,
      remoteAddress: remoteAddressOf(req, tcpAddress),
      accountId: undefined,
      sessionLogId: undefined,
    };
    let res: Response;
    try {
      res = await handle(match, statics, req, log, bodyTimeoutMs);
    } catch (e) {
      // Deno のデフォルトの 500 にはセキュリティヘッダーが付かないので、ページの外の例外もここで受ける。
      logError(e, log.requestId);
      // DB の混雑は待てば直る。プロキシやクライアントがやり直せるよう、500 と分けて 503 を返す。
      res = errorPage(isDbTimeout(e) ? 503 : 500);
    }
    res = withSecurityHeaders(res);
    log.time = new Date().toISOString();
    log.status = res.status;
    log.durationMs = Math.round((performance.now() - start) * 10) / 10;
    writeLog(log);
    return res;
  };
}

async function handle(
  match: Router,
  statics: StaticFiles,
  req: Request,
  log: AccessLog,
  bodyTimeoutMs: number,
) {
  const host = req.headers.get("host");
  if (host !== null && !VALID_HOST.test(host)) return errorPage(400);
  let url: URL;
  try {
    url = new URL(req.url);
  } catch {
    return errorPage(400);
  }
  if (url.hash !== "") return errorPage(400);
  // パスはそのままログに出すので、トークンなど秘密の値をパスに入れるルートを作らないこと。
  log.path = url.pathname.length > MAX_LOGGED_PATH_LENGTH
    ? url.pathname.slice(0, MAX_LOGGED_PATH_LENGTH)
    : url.pathname;
  // 静的ファイルはログインの有無で内容が変わらないので、セッションや CSRF を確かめない。
  if (url.pathname.startsWith(ASSETS_PREFIX)) return serveAsset(req, url);
  const staticFile = statics.serve(req, url);
  if (staticFile) return staticFile;

  const route = match(url.pathname, req.method);
  if (!route) return errorPage(404);
  log.route = route.route;
  const { handler: pageHandler } = route;
  if (!pageHandler) return methodNotAllowed(route.allow);
  const result = await bufferBody(req, MAX_BODY_BYTES, bodyTimeoutMs);
  if (result.status === "too_large") return errorPage(413);
  if (result.status === "timeout") return errorPage(408);
  const buffered = result.req;

  // ヘルスチェックは DB が止まっていてもレスポンスを返したいので、Cookie が付いていてもセッションを読まない。
  const session = SESSIONLESS_ROUTES.has(route.route) ? undefined : await getSession(buffered);
  if (session) {
    log.accountId = session.account.id;
    log.sessionLogId = session.logId;
  }
  const csrf = csrfFor(buffered, session);
  if (!(await csrf.verify(buffered))) {
    if (session) return errorPage(403);
    // セッションがなければ、書き換えられて困る状態もない。期限が切れたあとの送信などは、ログインからやり直せるようにする。
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
      new Context(
        route.route,
        route.params,
        session,
        log.remoteAddress,
        log.requestId,
        buffered,
        url,
        csrf,
      ),
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

type BufferResult = { status: "ok"; req: Request } | { status: "too_large" } | {
  status: "timeout";
};

// リクエストごとにオブジェクトを作らないよう、失敗の結果はモジュールに 1 つずつ置いて使い回す。
const TOO_LARGE: BufferResult = { status: "too_large" };
const TIMEOUT: BufferResult = { status: "timeout" };

/**
 * リクエストボディを上限まで読み込み、何度でも読める Request にして返す。
 * 上限を超えたら too_large を、timeoutMs ミリ秒で読み終わらなければ timeout を返す。
 * Content-Length は省略も偽装もできるので、実際に読んだ量でも判定する。
 */
async function bufferBody(
  req: Request,
  limit: number,
  timeoutMs: number,
): Promise<BufferResult> {
  if (req.body === null) return { status: "ok", req };
  if (Number(req.headers.get("content-length")) > limit) return TOO_LARGE;
  const reader = req.body.getReader();
  // タイムアウトはチャンクごとではなく、リクエストボディ全体に設定する。チャンクごとだと、1 バイトずつ送り続ける接続を止められない。
  const timer = setTimeout(expireBody, timeoutMs, reader);
  const chunks: Array<Uint8Array> = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (expiredBodies.has(reader)) return TIMEOUT;
      if (done) break;
      size += value.byteLength;
      if (size > limit) {
        await reader.cancel();
        return TOO_LARGE;
      }
      chunks.push(value);
    }
  } finally {
    clearTimeout(timer);
  }
  // 小さなリクエストボディはほとんど 1 つのチャンクで届くので、そのときはコピーしない。
  // Content-Length の分を先に確保すると、大きな値を宣言して少しだけ送る接続のたびにメモリを取られてしまう。
  // そこで、届いた分だけを使う。
  // Deno のチャンクは ArrayBuffer の上にあるが、ストリームの型は SharedArrayBuffer も含むので、型を絞る。
  if (chunks.length === 1) {
    return { status: "ok", req: new Request(req, { body: chunks[0] as Uint8Array<ArrayBuffer> }) };
  }
  const body = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return { status: "ok", req: new Request(req, { body }) };
}

/** 読み込み中の read() を done で終わらせ、bufferBody() に timeout を返させる。 */
function expireBody(reader: ReadableStreamDefaultReader<Uint8Array>) {
  expiredBodies.add(reader);
  // 取り消しに失敗してもレスポンスには影響しないが、握りつぶさずにログに残す。
  reader.cancel().catch(logError);
}

/**
 * ページに渡す ctx。リクエストごとに作るので、ページが使わないかもしれない値は、読まれたときに作る。
 * 関数の値は、分割代入で取り出してから呼んでも動くよう、this に頼らない関数を読まれたときに作る。
 */
class Context implements RouteContext {
  readonly #req: Request;
  readonly #url: URL;
  readonly #csrf: Csrf;
  #csrfToken: (() => Promise<string>) | undefined;
  #form: (() => Promise<FormData>) | undefined;

  constructor(
    readonly route: RouteContext["route"],
    readonly params: Record<string, string>,
    readonly session: Session | undefined,
    readonly remoteAddress: string | undefined,
    readonly requestId: string,
    req: Request,
    url: URL,
    csrf: Csrf,
  ) {
    this.#req = req;
    this.#url = url;
    this.#csrf = csrf;
  }

  get query(): URLSearchParams {
    return this.#url.searchParams;
  }

  get csrfToken(): () => Promise<string> {
    return this.#csrfToken ??= () => this.#csrf.token();
  }

  get form(): () => Promise<FormData> {
    return this.#form ??= () => formOf(this.#req);
  }
}

async function formOf(req: Request) {
  const form = await parseForm(req);
  if (!form) throw new InvalidFormError();
  return form;
}
