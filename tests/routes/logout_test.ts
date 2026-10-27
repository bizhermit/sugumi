// アプリは dist/public/ を読み込むので、先に deno task build が必要。
import assert from "node:assert/strict";
import { createSession, sessionCookie } from "../../src/lib/auth/session.ts";
import { db } from "../../src/lib/db.ts";
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

async function sessionCount() {
  const { rows } = await db.query<{ count: string }>("SELECT count(*) FROM sessions");
  return Number(rows[0].count);
}

Deno.test("logout: GET では確認画面を出すだけで、ログアウトしない", async () => {
  const cookie = await login();
  const res = await request("/logout", { headers: { cookie } });
  assert.equal(res.status, 200);
  assert.match(await res.text(), /<form method="post" action="\/logout">/);
  assert.equal(await sessionCount(), 1);
});

Deno.test("logout: 確認画面からの POST でログアウトし、Cookie を消す", async () => {
  const cookie = await login();
  const page = await (await request("/logout", { headers: { cookie } })).text();
  const token = page.match(/name="_csrf" value="([^"]+)"/)?.[1];
  assert.ok(token !== undefined);
  const res = await request("/logout", {
    method: "POST",
    headers: { cookie },
    body: new URLSearchParams({ _csrf: token }),
  });
  assert.equal(res.status, 303);
  assert.equal(res.headers.get("location"), "/login");
  assert.match(res.headers.get("set-cookie") ?? "", /^__Host-sid=; .*Max-Age=0/);
  assert.equal(await sessionCount(), 0);
  assert.equal((await request("/home", { headers: { cookie } })).status, 302);
});
