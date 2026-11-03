import type { IncomingMessage, ServerResponse } from "node:http";
import type { Method, RouteMap } from "./routes.ts";

async function handle(routes: RouteMap, req: IncomingMessage, res: ServerResponse) {
  const url = new URL(req.url ?? "/", "http://localhost");
  const method = req.method ?? "GET";
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion
  const handler = routes[url.pathname]?.[method === "HEAD" ? "GET" : (method as Method)];
  const response =
    handler == null ? new Response("Not Found", { status: 404 }) : await handler(new Request(url, { method }));
  res.writeHead(response.status, Object.fromEntries(response.headers));
  res.end(Buffer.from(await response.arrayBuffer()));
}

export function createApp(routes: RouteMap) {
  return (req: IncomingMessage, res: ServerResponse) => {
    void handle(routes, req, res);
  };
}
