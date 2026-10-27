// アプリは dist/public/ を読み込むため、先に deno task build が要る
import assert from "node:assert/strict";
import { createSession, sessionCookie } from "../../src/lib/auth/session.ts";
import { randomToken } from "../../src/lib/crypto.ts";
import { db } from "../../src/lib/db.ts";
import { DB_POOL_MAX, PRE_LOGIN_CSRF_TIMEOUT_MINUTES } from "../../src/lib/env.ts";
import { createApp } from "../../src/web/app.ts";
import { asset } from "../../src/web/assets.ts";
import { cookiePair } from "../_support/cookie.ts";
import { addAccount, resetDb, TEST_PASSWORD } from "../_support/db.ts";
import { captureLogs } from "../_support/logs.ts";

const handler = await createApp({ mock: false });

// src/web/app.ts の MAX_BODY_BYTES
const MAX_BODY_BYTES = 1024 * 1024;

/** 本文を読み捨てて、ステータスとヘッダーだけを返す。 */
async function head(path: string, init?: RequestInit) {
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

Deno.test("app: DB の接続の空きを待ちきれなければ 503 を返す", async () => {
  await resetDb();
  const account = await addAccount();
  const cookie = cookiePair(sessionCookie(await createSession(account)));
  // 接続をすべて使い切り、セッションを引く問い合わせを DB_CONNECTION_TIMEOUT_SECONDS だけ待たせる
  const clients = [];
  for (let i = 0; i < DB_POOL_MAX; i++) clients.push(await db.connect());
  const error = console.error;
  console.error = () => {};
  try {
    const res = await head("/home", { headers: { cookie } });
    assert.equal(res.status, 503);
    assert.equal(res.headers.get("x-frame-options"), "DENY");
  } finally {
    console.error = error;
    for (const client of clients) client.release();
  }
  // 接続が空けば、また応答できる
  assert.equal((await head("/home", { headers: { cookie } })).status, 200);
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
  const cases: Array<[string, RequestInit | undefined, number]> = [
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

Deno.test("app: ログにパスワード・トークン・セッション ID・クエリ文字列を出さず、リクエスト ID で突き合わせられる", async () => {
  await resetDb();
  const account = await addAccount();
  const secrets: Array<string> = [TEST_PASSWORD, "secret-query"];
  const logs = await captureLogs(async () => {
    const page = await handler(new Request("http://localhost/login?to=%2Fhome%3Fq%3Dsecret-query"));
    const preLogin = cookiePair(page.headers.get("set-cookie")!);
    const csrf = (await page.text()).match(/name="_csrf" value="([^"]+)"/)![1];
    secrets.push(preLogin.split("=")[1], csrf);
    const login = await head("/login", {
      method: "POST",
      headers: { cookie: preLogin },
      body: new URLSearchParams({
        _csrf: csrf,
        username: account.username,
        password: TEST_PASSWORD,
        to: "/home?q=secret-query",
      }),
    });
    const session = cookiePair(
      login.headers.getSetCookie().find((c) => c.startsWith("__Host-sid="))!,
    );
    secrets.push(session.split("=")[1]);
    const home = await handler(
      new Request("http://localhost/home", { headers: { cookie: session } }),
    );
    const logoutToken = (await home.text()).match(/name="_csrf" value="([^"]+)"/)![1];
    secrets.push(logoutToken);
    await head("/logout", {
      method: "POST",
      headers: { cookie: session },
      body: new URLSearchParams({ _csrf: logoutToken }),
    });
  });
  const text = JSON.stringify(logs);
  for (const secret of secrets) assert.ok(!text.includes(secret), secret);

  const accesses = logs.filter((log) => log.type === "access");
  assert.deepEqual(
    accesses.map((log) => [log.method, log.path, log.status, log.accountId]),
    [
      ["GET", "/login", 200, undefined],
      ["POST", "/login", 303, undefined],
      ["GET", "/home", 200, account.id],
      ["POST", "/logout", 303, account.id],
    ],
  );
  const audits = logs.filter((log) => log.type === "audit");
  assert.deepEqual(audits.map((log) => log.event), ["login_succeeded", "logged_out"]);
  assert.equal(audits[0].requestId, accesses[1].requestId);
  assert.equal(audits[1].requestId, accesses[3].requestId);
  // ログインの後のリクエストを、どのログインによるものか突き合わせられる
  assert.equal(typeof audits[0].sessionLogId, "string");
  assert.equal(accesses[2].sessionLogId, audits[0].sessionLogId);
  assert.equal(accesses[3].sessionLogId, audits[0].sessionLogId);
  assert.equal(audits[1].sessionLogId, audits[0].sessionLogId);
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
