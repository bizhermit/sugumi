// アプリは dist/public/ を読み込むので、先に deno task build が必要。
import assert from "node:assert/strict";
import { createSession, sessionCookie } from "../../src/lib/auth/session.ts";
import { createApp } from "../../src/web/app.ts";
import { cookiePair } from "../_support/cookie.ts";
import { addAccount, resetDb } from "../_support/db.ts";

const handler = await createApp({ mock: false });

Deno.test("top: ログイン中ならホームへ、そうでなければログイン画面へリダイレクトする", async () => {
  await resetDb();
  const account = await addAccount();
  const cookie = cookiePair(sessionCookie(await createSession(account)));
  const request = (init?: RequestInit) => handler(new Request("http://localhost/", init));
  assert.equal((await request({ headers: { cookie } })).headers.get("location"), "/home");
  assert.equal((await request()).headers.get("location"), "/login");
});
