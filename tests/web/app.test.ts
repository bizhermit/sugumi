import { createServer, type Server } from "node:http";
import { after, before, describe, it } from "node:test";
import { handler } from "../../src/web/app.ts";
import assert from "node:assert/strict";

describe("handler", () => {
  let server: Server;
  let baseUrl: string;

  before(async () => {
    server = createServer(handler);
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

  it("[GET] / : 200 OK", async () => {
    const res = await fetch(`${baseUrl}/`);
    assert.equal(res.status, 200);
  });

  it("[GET] /unknown : 404 NotFound", async () => {
    const res = await fetch(`${baseUrl}/unknown`);
    assert.equal(res.status, 404);
  });
});
