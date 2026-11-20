import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { newPassword } from "../../../src/features/auth/_shared/account.ts";
import { createAccount } from "../../../src/features/auth/accounts.ts";
import { DEFAULT_RETURN_PATH } from "../../../src/features/auth/return-to.ts";
import type { DataBase } from "../../../src/lib/db.ts";
import { deleteAccounts, deleteAddressFailures, prepareTestDb } from "../helpers/db.ts";
import { TEST_LOGIN_LIMITS } from "../helpers/limits.ts";
import { startTestServer, type TestServer } from "../helpers/server.ts";

/* oxlint-disable no-await-in-loop */

const PREFIX = "test-password-";
const USERNAME = `${PREFIX}user1`;
const LOCK_USERNAME = `${PREFIX}user2`;
const CHANGE_USERNAME = `${PREFIX}user3`;
const PASSWORD = "correct-pass";
const NEW_PASSWORD = "new-correct-pass";
const ADDRESS = "203.0.113.3"; // 接続元ごとの制限に他のテストの失敗が混ざらないように、このファイル専用の接続元を固定
const PATH = "/user/password";

function cookieValue(res: Response, name: string): string | undefined {
  const prefix = `__Host-${name}=`;
  const cookie = res.headers.getSetCookie().find((c) => c.startsWith(prefix));
  return cookie?.slice(prefix.length).split(";")[0];
}

function cookieHeader(cookies: Record<string, string>): string {
  return Object.entries(cookies)
    .map(([name, value]) => `__Host-${name}=${value}`)
    .join("; ");
}

describe("password change", () => {
  let db: DataBase;
  let server: TestServer;

  before(async () => {
    db = prepareTestDb();
    await deleteAccounts(db, PREFIX);
    await deleteAddressFailures(db, ADDRESS);
    await createAccount(db, USERNAME, "テストユーザー１", PASSWORD);
    await createAccount(db, LOCK_USERNAME, "テストユーザー２", PASSWORD);
    await createAccount(db, CHANGE_USERNAME, "テストユーザー３", PASSWORD);
    server = await startTestServer(db);
  });

  after(async () => {
    await server.close();
    await deleteAccounts(db, PREFIX);
    await db.end();
  });

  function post(path: string, cookies: Record<string, string>, fields: Record<string, string>): Promise<Response> {
    return fetch(`${server.baseUrl}${path}`, {
      method: "POST",
      redirect: "manual",
      headers: {
        "sec-fetch-site": "same-origin",
        "x-forwarded-for": ADDRESS,
        cookie: cookieHeader(cookies),
        "content-type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams(fields).toString(),
    });
  }

  function get(path: string, cookies: Record<string, string> = {}): Promise<Response> {
    return fetch(`${server.baseUrl}${path}`, { redirect: "manual", headers: { cookie: cookieHeader(cookies) } });
  }

  async function login(username: string, password: string): Promise<Response> {
    const csrf = cookieValue(await get("/login"), "csrf");
    assert.ok(csrf != null);
    return await post("/login", { csrf }, { _csrf: csrf, username, password });
  }

  async function loginSession(username: string): Promise<{ session: string; csrf: string }> {
    const res = await login(username, PASSWORD);
    assert.equal(res.status, 303);
    const session = cookieValue(res, "session");
    const csrf = cookieValue(res, "csrf");
    assert.ok(session != null);
    assert.ok(csrf != null);
    return { session, csrf };
  }

  function change(
    auth: { session: string; csrf: string },
    fields: { currentPassword: string; newPassword: string; confirmPassword: string },
  ): Promise<Response> {
    return post(PATH, auth, { _csrf: auth.csrf, ...fields });
  }

  it("未ログイン中は/loginへ画面遷移する", async () => {
    const res = await get(PATH);
    assert.equal(res.status, 303);
    assert.equal(res.headers.get("location"), "/login?to=%2Fuser%2Fpassword");
  });

  it("ログイン中は入力欄とnavのリンクを表示する", async () => {
    const auth = await loginSession(USERNAME);
    const res = await get(PATH, auth);
    assert.equal(res.status, 200);
    const html = await res.text();
    assert.match(html, /<a href="\/user\/password">/);
    assert.match(html, new RegExp(`action="${PATH}"`));
    for (const name of ["currentPassword", "newPassword", "confirmPassword"]) {
      assert.match(html, new RegExp(`<input type="password"[^>]* name="${name}"`));
    }
  });

  for (const [label, fields, message] of [
    [
      "現在のパスワードが空",
      { currentPassword: "", newPassword: NEW_PASSWORD, confirmPassword: NEW_PASSWORD },
      "現在のパスワードを入力してください",
    ],
    [
      "新しいパスワードが最小文字数に満たない",
      { currentPassword: PASSWORD, newPassword: "p".repeat(newPassword.options.minLength - 1), confirmPassword: "p" },
      `新しいパスワードは${newPassword.options.minLength}文字以上で入力してください`,
    ],
    [
      "確認が一致しない",
      { currentPassword: PASSWORD, newPassword: NEW_PASSWORD, confirmPassword: `${NEW_PASSWORD}x` },
      "新しいパスワードと一致しません",
    ],
    [
      "現在のパスワードが違う",
      { currentPassword: "wrong-pass", newPassword: NEW_PASSWORD, confirmPassword: NEW_PASSWORD },
      "現在のパスワードが違います",
    ],
    [
      "新しいパスワードが現在と同じ",
      { currentPassword: PASSWORD, newPassword: PASSWORD, confirmPassword: PASSWORD },
      "現在のパスワードと違うものを入力してください",
    ],
  ] as const) {
    it(`${label}なら400を返し、文言付きで画面を表示する`, async () => {
      const auth = await loginSession(USERNAME);
      const res = await change(auth, fields);
      assert.equal(res.status, 400);
      const html = await res.text();
      assert.match(html, new RegExp(`<span class="form-error">${message}</span>`));
      assert.equal((await login(USERNAME, PASSWORD)).status, 303);
    });
  }

  it("現在のパスワードの間違いが続くとアカウントをロックし、ログインもできなくなる", async () => {
    const auth = await loginSession(LOCK_USERNAME);
    const fields = { currentPassword: "wrong-pass", newPassword: NEW_PASSWORD, confirmPassword: NEW_PASSWORD };
    for (let i = 1; i < TEST_LOGIN_LIMITS.maxFailedAttempts; i++) {
      assert.equal((await change(auth, fields)).status, 400);
    }
    const locking = await change(auth, fields);
    assert.equal(locking.status, 400);
    assert.match(await locking.text(), /アカウントをロックしました/);
    const locked = await change(auth, { ...fields, currentPassword: PASSWORD });
    assert.equal(locked.status, 400);
    assert.match(await locked.text(), /アカウントがロックされています/);
    assert.equal((await login(LOCK_USERNAME, PASSWORD)).status, 401);
  });

  it("変更に成功すると完了画面へ画面遷移し、他のセッションを失効させ、新しいパスワードでログインできる", async () => {
    const other = await loginSession(CHANGE_USERNAME);
    const auth = await loginSession(CHANGE_USERNAME);
    const res = await change(auth, {
      currentPassword: PASSWORD,
      newPassword: NEW_PASSWORD,
      confirmPassword: NEW_PASSWORD,
    });
    assert.equal(res.status, 303);
    assert.equal(res.headers.get("location"), `${PATH}?done`);

    const done = await get(`${PATH}?done`, auth);
    assert.equal(done.status, 200);
    assert.match(await done.text(), /パスワードを変更しました。/);

    assert.equal((await get(DEFAULT_RETURN_PATH, other)).status, 303);
    assert.equal((await login(CHANGE_USERNAME, PASSWORD)).status, 401);
    assert.equal((await login(CHANGE_USERNAME, NEW_PASSWORD)).status, 303);
  });
});
