import assert from "node:assert/strict";
import { createSession, getSession, sessionCookie } from "../../../src/lib/auth/session.ts";
import type { Session } from "../../../src/lib/auth/session.ts";
import { db } from "../../../src/lib/db.ts";
import {
  SESSION_ABSOLUTE_TIMEOUT_MINUTES,
  SESSION_IDLE_TIMEOUT_MINUTES,
} from "../../../src/lib/env.ts";
import { cookiePair } from "../../_support/cookie.ts";
import { addAccount, resetDb } from "../../_support/db.ts";

const MINUTE_MS = 60 * 1000;

function requestWith(session: Session): Request {
  return new Request("http://localhost/", {
    headers: { cookie: cookiePair(sessionCookie(session)) },
  });
}

async function newSession(): Promise<Session> {
  await resetDb();
  return await createSession((await addAccount()).id);
}

/** DB の時刻を ago ミリ秒前にずらし、時間が経ったことにする。 */
async function age(
  column: "created_at" | "last_access_at",
  ago: number,
): Promise<void> {
  await db.query(`UPDATE sessions SET ${column} = $1`, [new Date(Date.now() - ago)]);
}

async function count(): Promise<number> {
  const { rows } = await db.query<{ count: string }>("SELECT count(*) FROM sessions");
  return Number(rows[0].count);
}

Deno.test("session: Cookie のセッションを返す", async () => {
  const session = await newSession();
  assert.deepEqual(await getSession(requestWith(session)), session);
  assert.equal(await getSession(new Request("http://localhost/")), undefined);
  assert.equal(
    await getSession(new Request("http://localhost/", { headers: { cookie: "__Host-sid=x" } })),
    undefined,
  );
  // DB にはトークンそのものを保存しない
  const { rows } = await db.query<{ token_hash: string }>("SELECT token_hash FROM sessions");
  assert.notEqual(rows[0].token_hash, session.id);
});

Deno.test({
  name: "session: 操作がないまま SESSION_IDLE_TIMEOUT_MINUTES が経つと切れる",
  ignore: SESSION_IDLE_TIMEOUT_MINUTES === 0,
  async fn() {
    const session = await newSession();
    const idle = SESSION_IDLE_TIMEOUT_MINUTES * MINUTE_MS;
    await age("last_access_at", idle - MINUTE_MS);
    assert.deepEqual(await getSession(requestWith(session)), session);

    // アクセスすると期限が延びる
    const { rows } = await db.query<{ last_access_at: Date }>(
      "SELECT last_access_at FROM sessions",
    );
    assert.ok(Date.now() - rows[0].last_access_at.getTime() < MINUTE_MS);

    await age("last_access_at", idle);
    assert.equal(await getSession(requestWith(session)), undefined);
    assert.equal(await count(), 0);
  },
});

Deno.test({
  name: "session: 操作を続けていても、ログインから SESSION_ABSOLUTE_TIMEOUT_MINUTES が経つと切れる",
  ignore: SESSION_ABSOLUTE_TIMEOUT_MINUTES === 0,
  async fn() {
    const session = await newSession();
    const absolute = SESSION_ABSOLUTE_TIMEOUT_MINUTES * MINUTE_MS;
    await age("created_at", absolute - MINUTE_MS);
    assert.deepEqual(await getSession(requestWith(session)), session);

    await age("created_at", absolute);
    assert.equal(await getSession(requestWith(session)), undefined);
    assert.equal(await count(), 0);
  },
});

Deno.test("session: アカウントを消すとセッションも消える", async () => {
  const session = await newSession();
  await db.query("DELETE FROM accounts");
  assert.equal(await getSession(requestWith(session)), undefined);
});
