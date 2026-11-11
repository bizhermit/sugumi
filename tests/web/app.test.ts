import { createServer, type Server } from "node:http";
import { after, before, describe, it } from "node:test";
import { createApp } from "../../src/web/app.ts";
import assert from "node:assert/strict";
import { routes } from "../../src/routes.ts";
import { createLogger } from "../../src/lib/logger.ts";
import { createDb } from "../../src/lib/db.ts";

describe("createApp", () => {
  let server: Server;
  let baseUrl: string;

  before(async () => {
    const logger = createLogger({
      level: "error",
      format: "json",
      write: () => {
        // テストのため出力しない
      },
    });
    const db = createDb("postgres://localhost/unused", logger);
    server = createServer(
      createApp(routes, {
        logger,
        db,
      }),
    );
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    assert.ok(address !== null && typeof address === "object");
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  after(async () => {
    await new Promise<void>((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
  });

  it("[GET] /healthz : 200 OK", async () => {
    const res = await fetch(`${baseUrl}/healthz`);
    assert.equal(res.status, 200);
    assert.equal(await res.text(), "OK");
  });

  it("[GET] / : 302 → /login", async () => {
    const res = await fetch(`${baseUrl}/`, { redirect: "manual" });
    assert.equal(res.status, 302);
    assert.equal(res.headers.get("location"), "/login");
  });

  it("[GET] /unknown : 404 NotFound", async () => {
    const res = await fetch(`${baseUrl}/unknown`);
    assert.equal(res.status, 404);
  });
});
