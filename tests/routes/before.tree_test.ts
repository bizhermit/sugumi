// src/routes/before.tree.ts を、実際のルートとアプリのハンドラを通して確かめる。
// アプリは dist/public/ を読み込むため、先に deno task build が要る
import assert from "node:assert/strict";
import { createSession, sessionCookie } from "../../src/lib/auth/session.ts";
import { createApp } from "../../src/web/app.ts";
import { cookiePair } from "../_support/cookie.ts";
import { addAccount, resetDb } from "../_support/db.ts";

const handler = await createApp({ mock: false });

function request(path: string, init?: RequestInit) {
  return handler(new Request(`http://localhost${path}`, init));
}

async function login() {
  await resetDb();
  const account = await addAccount();
  return cookiePair(sessionCookie(await createSession(account)));
}

Deno.test("before.tree: ログインしていなければ、元の URL を to に付けてログイン画面へ送る", async () => {
  await resetDb();
  for (const method of ["GET", "HEAD"]) {
    const res = await request("/home?tab=a&b=1", { method });
    assert.equal(res.status, 302, method);
    assert.equal(res.headers.get("location"), "/login?to=%2Fhome%3Ftab%3Da%26b%3D1", method);
  }
});

Deno.test("before.tree: 期限切れなどで引けないセッションの Cookie は、ログインしていないものとして扱う", async () => {
  await resetDb();
  const res = await request("/home", { headers: { cookie: "__Host-sid=unknown" } });
  assert.equal(res.status, 302);
  assert.equal(res.headers.get("location"), "/login?to=%2Fhome");
});

Deno.test("before.tree: ログインしていれば、ページを開ける", async () => {
  const cookie = await login();
  const res = await request("/home", { headers: { cookie } });
  assert.equal(res.status, 200);
  assert.match(await res.text(), /alice の表示名としてログインしています/);
});

Deno.test("before.tree: PUBLIC_ROUTES はログインなしで開ける", async () => {
  await resetDb();
  for (const path of ["/healthz", "/login"]) {
    const res = await request(path);
    assert.equal(res.status, 200, path);
    await res.body?.cancel();
  }
  // ログインを求めないが、ページがログイン画面へ送る。to を付けないことを確かめる
  for (const path of ["/", "/logout"]) {
    const res = await request(path);
    assert.equal(res.status, 302, path);
    assert.equal(res.headers.get("location"), "/login", path);
  }
});

Deno.test("before.tree: ファイルのないメソッドには、ログインの確認より先に 405 を返す", async () => {
  await resetDb();
  const res = await request("/home", { method: "DELETE" });
  assert.equal(res.status, 405);
  assert.equal(res.headers.get("allow"), "GET, HEAD");
  await res.body?.cancel();
});
