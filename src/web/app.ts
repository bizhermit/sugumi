import type { IncomingMessage, ServerResponse } from "node:http";

export function handler(req: IncomingMessage, res: ServerResponse) {
  const { pathname } = new URL(req.url ?? "/", "http://localhost");
  if (pathname === "/healthz") {
    res.writeHead(200, { "content-type": "text/plain; charset=utf-8" });
    res.end("OK");
    return;
  }
  res.writeHead(200, { "content-type": "text/plain; charset=utf-8" });
  res.end("Hello");
}
