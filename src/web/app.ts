import type { IncomingMessage, ServerResponse } from "node:http";
import type { Method, Middleware, RouteHandler, RouteMap } from "./routes.ts";
import { Readable } from "node:stream";
import { htmlDocument, Page } from "./html-document.tsx";
import { appSlot, type AppContext } from "./context.ts";
import { ASSETS_PREFIX, serveAsset } from "./assets.ts";

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
  try {
    if (url.pathname.startsWith(ASSETS_PREFIX)) {
      response = serveAsset(toRequest(req, url), url);
    } else if (route == null || handler == null) {
      response = new Response("Not Found", { status: 404 });
    } else {
      const request = toRequest(req, url);
      appSlot.set(request, { ...app, logger });
      response = await run(route.middleware ?? [], handler, request);
    }
  } catch (err) {
    logger.error("リクエストの処理に失敗しました。", { err, method, url: `${url.pathname}${url.search}` });
    response = new Response("Internal Server Error", { status: 500 });
  }

  const headers: Record<string, string | string[]> = Object.fromEntries(response.headers);
  const cookies = response.headers.getSetCookie();
  if (cookies.length > 0) {
    headers["set-cookie"] = cookies;
  }
  res.writeHead(response.status, headers);
  res.end(Buffer.from(await response.arrayBuffer()));

  logger.info("access", {
    method,
    path: url.pathname,
    query: [...url.searchParams.keys()],
    status: response.status,
    durationMs: Math.round((performance.now() - start) * 10) / 10,
  });
}

export function createApp(routes: RouteMap, app: AppContext) {
  return (req: IncomingMessage, res: ServerResponse) => {
    void handle(routes, app, req, res);
  };
}
