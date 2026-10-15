import { ASSETS_PREFIX, serveAsset } from "./assets.ts";
import { csrfFor } from "./csrf.ts";
import { errorPage } from "./error-page.ts";
import { loadRouter } from "./router.ts";
import { withSecurityHeaders } from "./security-headers.ts";
import { clearSessionCookie, getSession, hasSessionCookie } from "../lib/auth/session.ts";
import { path, redirect } from "./url.ts";

const match = await loadRouter();

// Deno の req.url は Host ヘッダーを検証せずに連結して作られるため、
// Host に `/` や `#` を含めると URL として解析したときの pathname を差し替えられる。
const VALID_HOST = /^(?:[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*|\[[0-9A-Fa-f:.]+\])(?::\d{1,5})?$/;

// ファイルのアップロードなど大きな本文を受けるルートを作るときは、ルートごとに上限を変えられるようにすること
const MAX_BODY_BYTES = 1024 * 1024;

export async function handler(req: Request, info?: Deno.ServeHandlerInfo): Promise<Response> {
  // X-Forwarded-For は利用者が書き換えられるため使わず、TCP の接続元を使う
  const addr = info?.remoteAddr;
  return withSecurityHeaders(
    await handle(req, addr && "hostname" in addr ? addr.hostname : undefined),
  );
}

async function handle(req: Request, remoteAddress: string | undefined): Promise<Response> {
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

  const route = match(url.pathname);
  if (!route) return errorPage(404);
  const buffered = await bufferBody(req, MAX_BODY_BYTES);
  if (!buffered) return errorPage(413);

  const session = await getSession(buffered);
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
    res = await route.handler(buffered, {
      params: route.params,
      session,
      csrfToken: csrf.token,
      remoteAddress,
    });
  } catch (e) {
    console.error(e);
    return errorPage(500);
  }
  return csrf.applyCookie(res);
}

/**
 * 本文を上限まで読み込み、何度でも読める Request にして返す。上限を超えたら undefined を返す。
 * Content-Length は省略や偽装ができるため、実際に読んだ量でも判定する。
 */
async function bufferBody(req: Request, limit: number): Promise<Request | undefined> {
  if (req.body === null) return req;
  if (Number(req.headers.get("content-length")) > limit) return undefined;
  const chunks: Uint8Array[] = [];
  let size = 0;
  for await (const chunk of req.body) {
    size += chunk.byteLength;
    if (size > limit) return undefined;
    chunks.push(chunk);
  }
  const body = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new Request(req, { body });
}
