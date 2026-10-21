// アプリは dist/public/ を読み込むため、先に deno task build が要る
import assert from "node:assert/strict";
import { createSession, sessionCookie } from "../../src/lib/auth/session.ts";
import { randomToken } from "../../src/lib/crypto.ts";
import { PRE_LOGIN_CSRF_TIMEOUT_MINUTES } from "../../src/lib/env.ts";
import { createApp } from "../../src/web/app.ts";
import { asset } from "../../src/web/assets.ts";
import { cookiePair } from "../_support/cookie.ts";
import { addAccount, resetDb } from "../_support/db.ts";

const handler = await createApp({ mock: false });

// src/web/app.ts の MAX_BODY_BYTES
const MAX_BODY_BYTES = 1024 * 1024;

/** 本文を読み捨てて、ステータスとヘッダーだけを返す。 */
async function head(path: string, init?: RequestInit): Promise<Response> {
  const res = await handler(new Request(`http://localhost${path}`, init));
  await res.body?.cancel();
  return res;
}

Deno.test("app: Host ヘッダーがホスト名とポートの形でなければ 400 を返す", async () => {
  for (
    const host of ["localhost", "localhost:3000", "app.example.com", "[::1]:3000", "127.0.0.1"]
  ) {
    assert.equal((await head("/healthz", { headers: { host } })).status, 200, host);
  }
  // Deno の req.url は Host を検証せずに連結して作るため、`/` や `#` で pathname を差し替えられる
  for (const host of ["evil/login", "evil#", "a b", "evil@localhost", "localhost:", ""]) {
    assert.equal((await head("/healthz", { headers: { host } })).status, 400, host);
  }
});

Deno.test("app: 本文が上限を超えたら、ページを呼ばずに 413 を返す", async () => {
  await resetDb();
  const body = new Uint8Array(MAX_BODY_BYTES + 1);
  assert.equal((await head("/login", { method: "POST", body })).status, 413);
  // Content-Length は偽れるため、読んだ量でも判定する。宣言が上限を超えていれば読まずに断る
  assert.equal(
    (await head("/login", {
      method: "POST",
      headers: { "content-length": String(MAX_BODY_BYTES + 1) },
      body: "x",
    })).status,
    413,
  );
  // 上限ちょうどは受け付け、CSRF の検証に進む
  const atLimit = await head("/login", { method: "POST", body: body.subarray(1) });
  assert.equal(atLimit.status, 303);
});

Deno.test("app: CSRF の検証に失敗したら、ログイン前ならログイン画面へ送る", async () => {
  await resetDb();
  const res = await head("/logout", { method: "POST" });
  assert.equal(res.status, 303);
  assert.equal(res.headers.get("location"), "/login");
});

Deno.test("app: 期限切れのセッションやログイン前の Cookie なら、expired を付けて送る", async () => {
  await resetDb();
  const stale = await head("/logout", {
    method: "POST",
    headers: { cookie: "__Host-sid=expired" },
  });
  assert.equal(stale.status, 303);
  assert.equal(stale.headers.get("location"), "/login?expired=1");
  assert.match(stale.headers.get("set-cookie") ?? "", /^__Host-sid=; .*Max-Age=0/);

  if (PRE_LOGIN_CSRF_TIMEOUT_MINUTES > 0) {
    const issuedAt = Date.now() - PRE_LOGIN_CSRF_TIMEOUT_MINUTES * 60 * 1000;
    const res = await head("/login", {
      method: "POST",
      headers: { cookie: `__Host-csrf=${issuedAt}.${randomToken()}` },
      body: new URLSearchParams({ _csrf: "x" }),
    });
    assert.equal(res.headers.get("location"), "/login?expired=1");
  }
});

Deno.test("app: ログイン中に CSRF の検証に失敗したら 403 を返す", async () => {
  await resetDb();
  const account = await addAccount();
  const cookie = cookiePair(sessionCookie(await createSession(account)));
  const res = await head("/logout", {
    method: "POST",
    headers: { cookie },
    body: new URLSearchParams({ _csrf: "x" }),
  });
  assert.equal(res.status, 403);
});

Deno.test("app: どの応答にもセキュリティヘッダーを付ける", async () => {
  await resetDb();
  const cases: [string, RequestInit | undefined, number][] = [
    ["/healthz", undefined, 200],
    ["/login", undefined, 200],
    ["/", undefined, 302],
    ["/nothing", undefined, 404],
    ["/healthz", { method: "POST" }, 405],
    ["/robots.txt", undefined, 200],
    [asset("web/_assets/index.js"), undefined, 200],
    ["/assets/nothing.js", undefined, 404],
    ["/healthz", { headers: { host: "evil/x" } }, 400],
  ];
  for (const [path, init, status] of cases) {
    const res = await head(path, init);
    assert.equal(res.status, status, path);
    assert.equal(res.headers.get("x-frame-options"), "DENY", path);
    assert.ok(res.headers.get("content-security-policy"), path);
  }
});

Deno.test("app: 静的ファイルと /assets/ は、ログインなしで取得できる", async () => {
  await resetDb();
  const robots = await head("/robots.txt");
  assert.equal(robots.status, 200);
  assert.equal(robots.headers.get("cache-control"), "no-cache");
  const js = await head(asset("web/_assets/index.js"));
  assert.equal(js.status, 200);
  assert.equal(js.headers.get("cache-control"), "public, max-age=31536000, immutable");
});

Deno.test("app: ページは CSS を JS より先に、共通のものをページのものより先に読み込む", async () => {
  await resetDb();
  const html = await (await handler(new Request("http://localhost/login"))).text();
  const order = [
    asset("web/_assets/index.css"),
    asset("routes/login/_assets/index.css"),
    asset("web/_assets/index.js"),
    asset("routes/login/_assets/index.js"),
  ].map((url) => html.indexOf(`"${url}"`));
  assert.ok(order.every((index) => index > 0), String(order));
  assert.deepEqual(order, order.toSorted((a, b) => a - b));
  assert.match(html, /^<!doctype html>\n<html lang="ja"><head><meta charset="utf-8">/);
  assert.match(html, /<title>ログイン<\/title>/);
});
