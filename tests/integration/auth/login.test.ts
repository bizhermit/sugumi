import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { createAccount } from "../../../src/features/auth/accounts.ts";
import type { DataBase } from "../../../src/lib/db.ts";
import { deleteAccounts, prepareTestDb } from "../helpers/db.ts";
import { startTestServer, type TestServer } from "../helpers/server.ts";
import { DEFAULT_RETURN_PATH } from "../../../src/features/auth/return-to.ts";

const PREFIX = "test-login-";
const USERNAME = `${PREFIX}user1`;
const PASSWORD = "correct-pass";

function cookieValue(res: Response, name: string): string | undefined {
  const prefix = `__Host-${name}=`;
  const cookie = res.headers.getSetCookie().find((c) => c.startsWith(prefix));
  return cookie?.slice(prefix.length).split(";")[0];
}

describe("login", () => {
  let db: DataBase;
  let server: TestServer;

  before(async () => {
    db = prepareTestDb();
    await deleteAccounts(db, PREFIX);
    await createAccount(db, USERNAME, "テストユーザー１", PASSWORD);
    server = await startTestServer(db);
  });

  after(async () => {
    await server.close();
    await deleteAccounts(db, PREFIX);
    await db.end();
  });

  async function getCsrfToken(): Promise<string> {
    const res = await fetch(`${server.baseUrl}/login`);
    const token = cookieValue(res, "csrf");
    assert.ok(token != null);
    return token;
  }

  function post(path: string, cookies: Record<string, string>, fields: Record<string, string>): Promise<Response> {
    return fetch(`${server.baseUrl}${path}`, {
      method: "POST",
      redirect: "manual",
      headers: {
        "sec-fetch-site": "same-origin",
        cookie: Object.entries(cookies)
          .map(([name, value]) => `__Host-${name}=${value}`)
          .join("; "),
        "content-type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams(fields).toString(),
    });
  }

  function get(path: string, cookies: Record<string, string> = {}): Promise<Response> {
    return fetch(`${server.baseUrl}${path}`, {
      redirect: "manual",
      headers: {
        cookie: Object.entries(cookies)
          .map(([name, value]) => `__Host-${name}=${value}`)
          .join("; "),
      },
    });
  }

  async function login(): Promise<{ session: string; csrf: string }> {
    const csrf = await getCsrfToken();
    const res = await post("/login", { csrf }, { _csrf: csrf, username: USERNAME, password: PASSWORD });
    assert.equal(res.status, 303);
    const session = cookieValue(res, "session");
    const newCsrf = cookieValue(res, "csrf");
    assert.ok(session != null);
    assert.ok(newCsrf != null);
    return { session, csrf: newCsrf };
  }

  it("パスワードが違う場合に401を返し、ログイン画面を表示する", async () => {
    const csrf = await getCsrfToken();
    const res = await post("/login", { csrf }, { _csrf: csrf, username: USERNAME, password: "wrong-pass" });
    assert.equal(res.status, 401);
    const html = await res.text();
    assert.match(html, /ユーザー名またはパスワードが違います。/);
    assert.match(html, new RegExp(`value="${USERNAME}"`));
    assert.equal(cookieValue(res, "session"), undefined);
  });

  it("ユーザーが存在しない場合に401を返し、ログイン画面を表示する", async () => {
    const csrf = await getCsrfToken();
    const res = await post("/login", { csrf }, { _csrf: csrf, username: `${PREFIX}nobody`, password: PASSWORD });
    assert.equal(res.status, 401);
  });

  it(`ログインに成功するとセッションCookieを発行し、CSRFトークンを作り直して${DEFAULT_RETURN_PATH}へ画面遷移する`, async () => {
    const csrf = await getCsrfToken();
    const res = await post("/login", { csrf }, { _csrf: csrf, username: USERNAME, password: PASSWORD });
    assert.equal(res.status, 303);
    assert.equal(res.headers.get("location"), DEFAULT_RETURN_PATH);
    assert.match(cookieValue(res, "session") ?? "", /^[A-Za-z0-9_-]{43}$/);
    const newCsrf = cookieValue(res, "csrf");
    assert.ok(newCsrf != null);
    assert.notEqual(newCsrf, csrf);
  });

  it("ログイン前のセッションはログイン時に削除する", async () => {
    const first = await login();
    const res = await post(
      "/login",
      { csrf: first.csrf, session: first.session },
      { _csrf: first.csrf, username: USERNAME, password: PASSWORD },
    );
    assert.equal(res.status, 303);
    assert.equal((await get(DEFAULT_RETURN_PATH, { session: first.session })).status, 303);
  });

  it(`未ログイン中は${DEFAULT_RETURN_PATH}を開くと/loginへ画面遷移する`, async () => {
    const res = await get(DEFAULT_RETURN_PATH);
    assert.equal(res.status, 303);
    assert.equal(res.headers.get("location"), "/login");
  });

  it(`ログイン中は${DEFAULT_RETURN_PATH}を表示可能`, async () => {
    const { session } = await login();
    const res = await get(DEFAULT_RETURN_PATH, { session });
    assert.equal(res.status, 200);
    const html = await res.text();
    assert.match(html, /action="\/logout"/);
  });

  it("未ログイン中に開いた画面のURLをtoに付けて/loginへ画面遷移する", async () => {
    const res = await get("/settings?hoge=1&fuga=2");
    assert.equal(res.status, 303);
    assert.equal(res.headers.get("location"), "/login?to=%2Fsettings%3Fhoge%3D1%26fuga%3D2");
  });

  it("ログイン画面はtoを隠しフィールドに入れ、ログイン後にそこへ画面遷移する", async () => {
    const res = await get("/login?to=%2Fsettings%3Fhoge%3D1%26fuga%3D2");
    assert.equal(res.status, 200);
    assert.match(await res.text(), /<input type="hidden" name="to" value="\/settings\?hoge=1&amp;fuga=2">/);
    const csrf = cookieValue(res, "csrf");
    assert.ok(csrf != null);
    const loginRes = await post(
      "/login",
      { csrf },
      { _csrf: csrf, username: USERNAME, password: PASSWORD, to: "/settings?hoge=1&fuga=2" },
    );
    assert.equal(loginRes.status, 303);
    assert.equal(loginRes.headers.get("location"), "/settings?hoge=1&fuga=2");
  });

  it("ログインに失敗してもtoを引き継ぐ", async () => {
    const csrf = await getCsrfToken();
    const res = await post(
      "/login",
      { csrf },
      { _csrf: csrf, username: USERNAME, password: "wrong-pass", to: "/settings" },
    );
    assert.equal(res.status, 401);
    assert.match(await res.text(), /name="to" value="\/settings"/);
  });

  for (const to of [
    "https://evil.example/",
    "//evil.example/",
    "/\\evil.example/",
    "/..//evil.example/",
    "/.//evil.example/",
    "/%2e%2e//evil.example/",
    "settings",
    "",
  ]) {
    it(`アプリ内のパスでないtoは無視して${DEFAULT_RETURN_PATH}へ: ${JSON.stringify(to)}`, async () => {
      const page = await get(`/login?${new URLSearchParams({ to }).toString()}`);
      assert.doesNotMatch(await page.text(), /name="to"/);
      const csrf = await getCsrfToken();
      const res = await post("/login", { csrf }, { _csrf: csrf, username: USERNAME, password: PASSWORD, to });
      assert.equal(res.status, 303);
      assert.equal(res.headers.get("location"), DEFAULT_RETURN_PATH);
    });
  }

  it("未ログインのPOSTは403を返す", async () => {
    const csrf = await getCsrfToken();
    assert.equal((await post("/logout", { csrf }, { _csrf: csrf })).status, 403);
  });

  it("ログアウトするとセッションとCookieを削除する", async () => {
    const { session, csrf } = await login();
    const res = await post("/logout", { session, csrf }, { _csrf: csrf });
    assert.equal(res.status, 303);
    assert.equal(res.headers.get("location"), "/login");
    assert.equal(cookieValue(res, "session"), "");
    assert.equal((await get(DEFAULT_RETURN_PATH, { session })).status, 303);
  });
});
