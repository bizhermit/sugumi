import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { createDb } from "../../src/lib/db.ts";
import { createTestLogger } from "./helpers/logger.ts";
import { startTestServer, type TestServer } from "./helpers/server.ts";

describe("createApp", () => {
  let server: TestServer;

  before(async () => {
    // DBを使用しないため繋がらないURLを使用する
    server = await startTestServer(createDb("postgres://localhost/unused", createTestLogger()));
  });

  after(async () => {
    await server.close();
  });

  it("[GET] /healthz : 200 OK", async () => {
    const res = await fetch(`${server.baseUrl}/healthz`);
    assert.equal(res.status, 200);
    assert.equal(await res.text(), "OK");
  });

  it("[GET] / : 302 → /login", async () => {
    const res = await fetch(`${server.baseUrl}/`, { redirect: "manual" });
    assert.equal(res.status, 302);
    assert.equal(res.headers.get("location"), "/login");
  });

  it("[GET] /unknown : 404 NotFound", async () => {
    const res = await fetch(`${server.baseUrl}/unknown`);
    assert.equal(res.status, 404);
  });
});
