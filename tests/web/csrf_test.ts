import assert from "node:assert/strict";
import { createSession } from "../../src/lib/auth/session.ts";
import { randomToken } from "../../src/lib/crypto.ts";
import { PRE_LOGIN_CSRF_TIMEOUT_MINUTES } from "../../src/lib/env.ts";
import { csrfFor } from "../../src/web/csrf.tsx";
import { cookiePair } from "../_support/cookie.ts";
import { addAccount, resetDb } from "../_support/db.ts";

const FORM_URL = "http://localhost/form";

function post(
  token: string | undefined,
  { cookie, header = false }: { cookie?: string; header?: boolean } = {},
): Request {
  const headers = new Headers(cookie ? { cookie } : {});
  if (header && token !== undefined) {
    headers.set("x-csrf-token", token);
    return new Request(FORM_URL, { method: "POST", headers });
  }
  const body = new URLSearchParams(token === undefined ? {} : { _csrf: token });
  return new Request(FORM_URL, { method: "POST", headers, body });
}

/** ログイン前のトークンを発行し、そのトークンと、ブラウザが次に送る Cookie を返す。 */
async function issuePreLogin(): Promise<{ token: string; cookie: string }> {
  const csrf = csrfFor(new Request(FORM_URL), undefined);
  const token = await csrf.token();
  const setCookie = csrf.apply(new Response()).headers.get("set-cookie");
  assert.ok(setCookie !== null && setCookie.startsWith("__Host-csrf="));
  return { token, cookie: cookiePair(setCookie) };
}

function preLoginCookie(issuedAt: number): string {
  return `__Host-csrf=${issuedAt}.${randomToken()}`;
}

Deno.test("csrf: GET などは検証せずに通す", async () => {
  const csrf = csrfFor(new Request(FORM_URL), undefined);
  for (const method of ["GET", "HEAD", "OPTIONS"]) {
    assert.equal(await csrf.verify(new Request(FORM_URL, { method })), true);
  }
});

Deno.test("csrf: ログイン前のトークンを、発行した Cookie と照合する", async () => {
  const { token, cookie } = await issuePreLogin();
  const csrf = csrfFor(post(token, { cookie }), undefined);
  assert.equal(csrf.stale, false);
  assert.equal(await csrf.verify(post(token, { cookie })), true);
  assert.equal(await csrf.verify(post(token, { cookie, header: true })), true);
  assert.equal(await csrf.verify(post(undefined, { cookie })), false);
  assert.equal(await csrf.verify(post(token.slice(1), { cookie })), false);

  // 別のブラウザの Cookie で発行したトークンは通さない
  const other = await issuePreLogin();
  assert.equal(await csrfFor(post(token, other), undefined).verify(post(token, other)), false);
  // Cookie がなければ照合先がないため通さない
  assert.equal(await csrfFor(post(token), undefined).verify(post(token)), false);
});

Deno.test({
  name: "csrf: ログイン前の Cookie は期限を過ぎると stale になり、照合しない",
  ignore: PRE_LOGIN_CSRF_TIMEOUT_MINUTES === 0,
  async fn() {
    const ttl = PRE_LOGIN_CSRF_TIMEOUT_MINUTES * 60 * 1000;
    const fresh = csrfFor(
      post("x", { cookie: preLoginCookie(Date.now() - ttl + 60_000) }),
      undefined,
    );
    assert.equal(fresh.stale, false);

    const cookie = preLoginCookie(Date.now() - ttl);
    const csrf = csrfFor(post("x", { cookie }), undefined);
    assert.equal(csrf.stale, true);
    // 期限切れの Cookie で発行したトークンでも、照合先がないため通さない
    const issued = await csrfFor(new Request(FORM_URL, { headers: { cookie } }), undefined).token();
    assert.equal(await csrf.verify(post(issued, { cookie })), false);
  },
});

Deno.test("csrf: 未来の時刻や形式の違う Cookie は stale になる", () => {
  for (const cookie of [preLoginCookie(Date.now() + 60_000), "__Host-csrf=abc"]) {
    assert.equal(csrfFor(post("x", { cookie }), undefined).stale, true, cookie);
  }
});

Deno.test("csrf: ログイン中はセッションに結び付いたトークンだけを通す", async () => {
  await resetDb();
  const account = await addAccount();
  const session = await createSession(account);
  const token = await csrfFor(new Request(FORM_URL), session).token();
  const csrf = csrfFor(post(token), session);
  assert.equal(await csrf.verify(post(token)), true);

  // 別のセッションのトークンや、ログイン前のトークンは通さない
  const otherSession = await createSession(account);
  assert.equal(await csrfFor(post(token), otherSession).verify(post(token)), false);
  const preLogin = await issuePreLogin();
  assert.equal(
    await csrfFor(post(preLogin.token, preLogin), session).verify(post(preLogin.token, preLogin)),
    false,
  );
});

Deno.test("csrf: token() を呼んだ応答は、ページの指定によらず no-store にする", async () => {
  const page = () => new Response("ok", { headers: { "cache-control": "public, max-age=60" } });

  const unused = csrfFor(new Request(FORM_URL), undefined).apply(page());
  assert.equal(unused.headers.get("cache-control"), "public, max-age=60");
  assert.equal(unused.headers.get("set-cookie"), null);

  const csrf = csrfFor(new Request(FORM_URL), undefined);
  await csrf.token();
  const used = csrf.apply(page());
  assert.equal(used.headers.get("cache-control"), "no-store");
  assert.equal(await used.text(), "ok");

  // 照合先の Cookie が既にあれば、Cookie を発行し直さない
  const { cookie } = await issuePreLogin();
  const again = csrfFor(new Request(FORM_URL, { headers: { cookie } }), undefined);
  await again.token();
  const res = again.apply(page());
  assert.equal(res.headers.get("cache-control"), "no-store");
  assert.equal(res.headers.get("set-cookie"), null);
});

Deno.test("csrf: ヘッダーが変更不可の Response にも、Cookie と no-store を付けられる", async () => {
  const csrf = csrfFor(new Request(FORM_URL), undefined);
  await csrf.token();
  const res = csrf.apply(Response.redirect("http://localhost/", 302));
  assert.equal(res.status, 302);
  assert.equal(res.headers.get("cache-control"), "no-store");
  assert.match(res.headers.get("set-cookie") ?? "", /^__Host-csrf=/);
});
