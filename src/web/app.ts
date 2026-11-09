import type { IncomingMessage, ServerResponse } from "node:http";
import type { Method, Middleware, RouteHandler, RouteMap } from "./routes.ts";
import { Readable } from "node:stream";
import { htmlDocument, Page } from "./html-document.tsx";
import { appSlot, type AppContext } from "./context.ts";
import { ASSETS_PREFIX, serveAsset } from "./assets.ts";
import { serveStatic, staticPaths } from "./static.ts";
import { applySecurityHeaders } from "./security-headers.ts";
import {
  createCsrfToken,
  isSafeMethod,
  isSameOrigin,
  readCsrfToken,
  createCsrfCookie,
  verifyCsrfToken,
  csrfSlot,
} from "./csrf.ts";
import { HttpError, STATUS_TEXTS } from "./http-error.ts";
import { pipeline } from "node:stream/promises";
import { formSlot, readForm } from "./form.ts";

function run(middleware: readonly Middleware[], handler: RouteHandler, req: Request): Promise<Response> {
  async function dispatch(index: number): Promise<Response> {
    const fn = middleware[index];
    if (fn == null) {
      const result = await handler(req);
      if (result instanceof Page) {
        return htmlDocument(result);
      }
      return result;
    }
    return await fn(req, () => dispatch(index + 1));
  }
  return dispatch(0);
}

function toRequest(req: IncomingMessage, url: URL): Request {
  const headers = new Headers();
  for (let i = 0; i + 1 < req.rawHeaders.length; i += 2) {
    headers.append(req.rawHeaders[i] ?? "", req.rawHeaders[i + 1] ?? "");
  }
  const method = req.method ?? "GET";
  const body = method === "GET" || method === "HEAD" ? null : Readable.toWeb(req);

  return new Request(url, {
    method,
    headers,
    body,
    duplex: "half",
  });
}

function isPrematureClose(err: unknown): boolean {
  return err instanceof Error && "code" in err && err.code === "ERR_STREAM_PREMATURE_CLOSE";
}

function createErrorResponse(status: number): Response {
  return new Response(STATUS_TEXTS[status] ?? "Error", { status });
}

async function handle(routes: RouteMap, app: AppContext, req: IncomingMessage, res: ServerResponse) {
  const start = performance.now();
  const url = new URL(req.url ?? "/", "http://localhost");
  const method = req.method ?? "GET";
  const route = routes[url.pathname];
  const requestId = crypto.randomUUID();
  const logger = app.logger.child({ requestId });

  // oxlint-disable-next-line typescript/no-unsafe-type-assertion
  const handler = route?.[method === "HEAD" ? "GET" : (method as Method)];

  let response: Response;
  let setCookie: string | undefined;
  try {
    if (url.pathname.startsWith(ASSETS_PREFIX)) {
      response = serveAsset(toRequest(req, url), url);
    } else if (route == null) {
      response = serveStatic(toRequest(req, url), url) ?? createErrorResponse(404);
    } else if (handler == null) {
      response = createErrorResponse(404);
    } else {
      const request = toRequest(req, url);
      if (!isSameOrigin(request)) {
        throw new HttpError(403, "同一オリジンからのリクエストではありません。");
      }
      let token = readCsrfToken(request);
      if (!isSafeMethod(method)) {
        const form = await readForm(request);
        if (!verifyCsrfToken(form, token)) {
          throw new HttpError(403, "CSRFトークンが一致しません。");
        }
        formSlot.set(request, form);
      }
      if (token == null) {
        token = createCsrfToken();
        setCookie = createCsrfCookie(token);
      }
      csrfSlot.set(request, token);
      appSlot.set(request, { ...app, logger });
      response = await run(route.middleware ?? [], handler, request);
    }
  } catch (err) {
    if (err instanceof HttpError) {
      logger.warn(err.message, { status: err.status, method, url: `${url.pathname}${url.search}` });
      response = createErrorResponse(err.status);
    } else {
      logger.error("リクエストの処理に失敗しました。", { err, method, url: `${url.pathname}${url.search}` });
      response = createErrorResponse(500);
    }
  }

  const headers = new Headers(response.headers);
  applySecurityHeaders(headers);
  if (setCookie != null) {
    headers.append("set-cookie", setCookie);
  }
  const record: Record<string, string | string[]> = Object.fromEntries(headers);
  const cookies = headers.getSetCookie();
  if (cookies.length > 0) {
    record["set-cookie"] = cookies;
  }
  res.writeHead(response.status, record);

  try {
    if (response.body == null || method === "HEAD") {
      await response.body?.cancel();
      res.end();
    } else {
      await pipeline(Readable.fromWeb(response.body), res);
    }
  } catch (err) {
    if (!isPrematureClose(err)) {
      logger.error("レスポンスの送信に失敗しました。", { err, method, url: `${url.pathname}${url.search}` });
    }
    res.destroy();
  }

  logger.info("access", {
    method,
    path: url.pathname,
    query: [...url.searchParams.keys()],
    status: response.status,
    durationMs: Math.round((performance.now() - start) * 10) / 10,
  });
}

export function createApp(routes: RouteMap, app: AppContext) {
  for (const path of staticPaths()) {
    if (routes[path] != null) {
      throw new Error(`static${path}とルートの${path}が重複しています。`);
    }
  }
  return (req: IncomingMessage, res: ServerResponse) => {
    void handle(routes, app, req, res);
  };
}
