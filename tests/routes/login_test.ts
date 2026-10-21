// アプリは dist/public/ を読み込むため、先に deno task build が要る
import assert from "node:assert/strict";
import { createSession, sessionCookie } from "../../src/lib/auth/session.ts";
import { db } from "../../src/lib/db.ts";
import { createApp } from "../../src/web/app.ts";
import { cookiePair } from "../_support/cookie.ts";
import { addAccount, resetDb, TEST_PASSWORD } from "../_support/db.ts";

const handler = await createApp({ mock: false });
const FAILED = "ユーザー名またはパスワードが違うか、アカウントがロックされています。";

function request(path: string, init?: RequestInit): Promise<Response> {
  return handler(new Request(`http://localhost${path}`, init));
}

/** path のページを開き、フォームの CSRF トークンと、次に送る Cookie を返す。 */
async function openForm(path: string, cookie?: string): Promise<{ token: string; cookie: string }> {
  const page = await request(path, { headers: cookie ? { cookie } : {} });
  assert.equal(page.status, 200, path);
  const token = (await page.text()).match(/name="_csrf" value="([^"]+)"/)?.[1];
  assert.ok(token !== undefined);
  const issued = page.headers.get("set-cookie");
  return { token, cookie: issued ? cookiePair(issued) : cookie ?? "" };
}

function postLogin(
  form: Record<string, string>,
  { token, cookie }: { token: string; cookie: string },
): Promise<Response> {
  return request("/login", {
    method: "POST",
    headers: { cookie },
    body: new URLSearchParams({ ...form, _csrf: token }),
  });
}

async function sessionCount(): Promise<number> {
  const { rows } = await db.query<{ count: string }>("SELECT count(*) FROM sessions");
  return Number(rows[0].count);
}

Deno.test("login: 画面の応答は no-store で、そのトークンでログインすると to に戻る", async () => {
  await resetDb();
  await addAccount();
  const page = await request("/login?to=%2Fhome%3Ftab%3Da");
  assert.equal(page.headers.get("cache-control"), "no-store");
  await page.body?.cancel();
  const form = await openForm("/login?to=%2Fhome%3Ftab%3Da");
  const login = { username: "alice", password: TEST_PASSWORD, to: "/home?tab=a" };

  const forged = await postLogin(login, { ...form, token: form.token.slice(1) });
  assert.equal(forged.status, 303);
  assert.equal(forged.headers.get("location"), "/login");

  const res = await postLogin(login, form);
  assert.equal(res.status, 303);
  assert.equal(res.headers.get("location"), "/home?tab=a");
  const cookies = res.headers.getSetCookie();
  assert.ok(cookies.some((c) => c.startsWith("__Host-sid=") && !c.includes("Max-Age=0")));
  // ログイン前の Cookie は消す
  assert.ok(cookies.some((c) => c.startsWith("__Host-csrf=;") && c.includes("Max-Age=0")));
});

Deno.test("login: 失敗の理由を区別せず、入力したユーザー名と戻り先を残して 401 を返す", async () => {
  await resetDb();
  await addAccount();
  const form = await openForm("/login");
  const bodies: string[] = [];
  for (const username of ["alice", "<b>bob</b>"]) {
    const res = await postLogin({ username, password: "wrong password", to: "/home" }, form);
    assert.equal(res.status, 401, username);
    bodies.push(await res.text());
  }
  for (const body of bodies) assert.ok(body.includes(FAILED));
  assert.match(bodies[0], /name="username"[^>]*value="alice"/);
  assert.match(bodies[1], /value="&#60;b&#62;bob&#60;\/b&#62;"/);
  assert.match(bodies[0], /<input type="hidden" name="to" value="\/home">/);
});

Deno.test("login: サイトの外を指す戻り先は捨てる", async () => {
  await resetDb();
  await addAccount();
  const page = await request("/login?to=%2F%2Fevil.example%2F");
  assert.doesNotMatch(await page.text(), /name="to"/);
  const form = await openForm("/login");
  const res = await postLogin(
    { username: "alice", password: TEST_PASSWORD, to: "//evil.example/" },
    form,
  );
  assert.equal(res.headers.get("location"), "/home");
});

Deno.test("login: 期限切れで送られてきたら、その旨を表示する", async () => {
  await resetDb();
  const res = await request("/login?expired=1");
  assert.match(await res.text(), /有効期限が切れました/);
});

Deno.test("login: ログイン中に開くとログアウトし、to を残してログイン画面を出し直す", async () => {
  await resetDb();
  const account = await addAccount();
  const cookie = cookiePair(sessionCookie(await createSession(account.id)));
  const res = await request("/login?to=%2Fhome", { headers: { cookie } });
  assert.equal(res.status, 302);
  assert.equal(res.headers.get("location"), "/login?to=%2Fhome");
  assert.match(res.headers.get("set-cookie") ?? "", /^__Host-sid=; .*Max-Age=0/);
  assert.equal(await sessionCount(), 0);
});

Deno.test("login: ログインのたびにセッションを作り直す", async () => {
  await resetDb();
  const account = await addAccount();
  const old = cookiePair(sessionCookie(await createSession(account.id)));
  // ログイン中のフォーム（ホームのログアウト）のトークンで、そのまま /login に送る
  const form = await openForm("/home", old);
  const res = await postLogin({ username: "alice", password: TEST_PASSWORD }, form);
  assert.equal(res.status, 303);
  const renewed = res.headers.getSetCookie().find((c) => c.startsWith("__Host-sid="));
  assert.ok(renewed !== undefined);
  assert.notEqual(cookiePair(renewed), old);
  // 前のセッションは消え、新しいセッションだけが残る
  assert.equal(await sessionCount(), 1);
  const home = await request("/home", { headers: { cookie: old } });
  assert.equal(home.status, 302);
});
