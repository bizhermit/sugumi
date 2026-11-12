import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { createAccount } from "../../../src/features/auth/accounts.ts";
import {
  clearSessionCookie,
  createSession,
  deleteSession,
  findSession,
  sessionCookie,
} from "../../../src/features/auth/session.ts";
import type { DataBase } from "../../../src/lib/db.ts";
import { deleteAccounts, prepareTestDb } from "../helpers/db.ts";

const PREFIX = "test-session-";
const MINUTE_MS = 60 * 1000;

function requestWithSession(token: string): Request {
  return new Request("http://localhost/home", { headers: { cookie: `__Host-session=${token}` } });
}

describe("session", () => {
  let db: DataBase;
  let accountId: number;

  before(async () => {
    db = prepareTestDb();
    await deleteAccounts(db, PREFIX);
    accountId = await createAccount(db, `${PREFIX}user1`, "テストユーザー１", "correct-pass");
  });

  after(async () => {
    await deleteAccounts(db, PREFIX);
    await db.end();
  });

  /** このアカウントのセッションを全部消してから1つ作る。時刻はDBの行を直接書き換えて動かす。 */
  async function createSessionAt(minutesAgo: { created?: number; lastAccess?: number }): Promise<string> {
    await db.query("DELETE FROM sessions WHERE account_id = $1", [accountId]);
    const token = await createSession(db, accountId);
    const now = Date.now();
    await db.query(
      "UPDATE sessions SET created_at = coalesce($2, created_at), last_access_at = coalesce($3, last_access_at) WHERE account_id = $1",
      [
        accountId,
        minutesAgo.created == null ? null : new Date(now - minutesAgo.created * MINUTE_MS),
        minutesAgo.lastAccess == null ? null : new Date(now - minutesAgo.lastAccess * MINUTE_MS),
      ],
    );
    return token;
  }

  async function sessionRows(): Promise<{ last_access_at: Date }[]> {
    const { rows } = await db.query<{ last_access_at: Date }>(
      "SELECT last_access_at FROM sessions WHERE account_id = $1",
      [accountId],
    );
    return rows;
  }

  it("作ったセッションをCookieから引ける", async () => {
    const token = await createSession(db, accountId);
    assert.match(token, /^[A-Za-z0-9_-]{43}$/);
    const session = await findSession(db, requestWithSession(token));
    assert.ok(session != null);
    assert.equal(session.token, token);
    assert.deepEqual(session.account, {
      id: accountId,
      username: `${PREFIX}user1`,
      displayName: "テストユーザー１",
    });
  });

  it("Cookieが無い、または形式が違えばundefined", async () => {
    assert.equal(await findSession(db, new Request("http://localhost/home")), undefined);
    assert.equal(await findSession(db, requestWithSession("x".repeat(43))), undefined);
    assert.equal(await findSession(db, requestWithSession("short")), undefined);
  });

  it("削除したセッションは引けない", async () => {
    const token = await createSession(db, accountId);
    await deleteSession(db, token);
    assert.equal(await findSession(db, requestWithSession(token)), undefined);
  });

  it("無操作30分で期限切れになり、行も消える", async () => {
    const token = await createSessionAt({ lastAccess: 31 });
    assert.equal(await findSession(db, requestWithSession(token)), undefined);
    assert.equal((await sessionRows()).length, 0);
  });

  it("作成から12時間で期限切れになる", async () => {
    const token = await createSessionAt({ created: 12 * 60 + 1 });
    assert.equal(await findSession(db, requestWithSession(token)), undefined);
  });

  it("最終アクセス時刻は1分以上経ったときだけ更新する", async () => {
    const token = await createSessionAt({ lastAccess: 2 });
    const touchedBefore = (await sessionRows())[0]?.last_access_at;
    assert.ok(touchedBefore != null);
    assert.ok(await findSession(db, requestWithSession(token)));
    const touchedAfter = (await sessionRows())[0]?.last_access_at;
    assert.ok(touchedAfter != null);
    assert.ok(touchedAfter.getTime() > touchedBefore.getTime());
    assert.ok(await findSession(db, requestWithSession(token)));
    assert.equal((await sessionRows())[0]?.last_access_at.getTime(), touchedAfter.getTime());
  });

  it("セッションを作るとき、期限切れの行をまとめて消す", async () => {
    await createSessionAt({ lastAccess: 31 });
    await createSession(db, accountId);
    assert.equal((await sessionRows()).length, 1);
  });

  it("Cookieの属性", () => {
    assert.equal(sessionCookie("abc"), "__Host-session=abc; Path=/; Secure; HttpOnly; SameSite=Lax");
    assert.equal(clearSessionCookie(), "__Host-session=; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=0");
  });
});
