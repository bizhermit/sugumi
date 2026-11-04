import type { IncomingMessage, ServerResponse } from "node:http";
import type { Method, Middleware, RouteHandler, RouteMap } from "./routes.ts";
import { Readable } from "node:stream";

function run(middleware: readonly Middleware[], handler: RouteHandler, req: Request): Promise<Response> {
  async function dispatch(index: number): Promise<Response> {
    const fn = middleware[index];
    if (fn == null) return await handler(req);
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

async function handle(routes: RouteMap, req: IncomingMessage, res: ServerResponse) {
  const url = new URL(req.url ?? "/", "http://localhost");
  const method = req.method ?? "GET";
  const route = routes[url.pathname];
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion
  const handler = routes[url.pathname]?.[method === "HEAD" ? "GET" : (method as Method)];

  const response =
    route == null || handler == null
      ? new Response("Not Found", { status: 404 })
      : await run(route.middleware ?? [], handler, toRequest(req, url));

  res.writeHead(response.status, Object.fromEntries(response.headers));
  res.end(Buffer.from(await response.arrayBuffer()));
}

export function createApp(routes: RouteMap) {
  return (req: IncomingMessage, res: ServerResponse) => {
    void handle(routes, req, res);
  };
}
