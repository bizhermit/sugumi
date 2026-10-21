// アプリは dist/public/ を読み込むため、先に deno task build が要る
import assert from "node:assert/strict";
import { handler } from "../../src/web/app.ts";
import { cookiePair } from "../_support/cookie.ts";
import { addAccount, resetDb, TEST_PASSWORD } from "../_support/db.ts";

function request(path: string, init?: RequestInit): Promise<Response> {
  return handler(new Request(`http://localhost${path}`, init));
}

Deno.test("login: 画面の応答は no-store で、そのトークンでログインすると to に戻る", async () => {
  await resetDb();
  await addAccount();
  const page = await request("/login?to=%2Fhome%3Ftab%3Da");
  assert.equal(page.headers.get("cache-control"), "no-store");
  const setCookie = page.headers.get("set-cookie");
  assert.ok(setCookie !== null);
  const html = await page.text();
  const token = html.match(/name="_csrf" value="([^"]+)"/)?.[1];
  assert.ok(token !== undefined);

  const form = { username: "alice", password: TEST_PASSWORD, to: "/home?tab=a" };
  const headers = { cookie: cookiePair(setCookie) };
  const forged = await request("/login", {
    method: "POST",
    headers,
    body: new URLSearchParams({ ...form, _csrf: token.slice(1) }),
  });
  assert.equal(forged.status, 303);
  assert.equal(forged.headers.get("location"), "/login");

  const res = await request("/login", {
    method: "POST",
    headers,
    body: new URLSearchParams({ ...form, _csrf: token }),
  });
  assert.equal(res.status, 303);
  assert.equal(res.headers.get("location"), "/home?tab=a");
  assert.match(res.headers.get("set-cookie") ?? "", /__Host-sid=/);
});
