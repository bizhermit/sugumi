// アプリは dist/public/ を読み込むので、先に deno task build が必要。
import { createSession, sessionCookie } from "../../src/lib/auth/session.ts";
import { PASSWORD_MAX_LENGTH } from "../../src/lib/auth/password.ts";
import { createApp } from "../../src/web/app.ts";
import { asset } from "../../src/web/assets.ts";
import { cookiePair } from "../../tests/_support/cookie.ts";
import { addAccount, resetDb, TEST_PASSWORD } from "../../tests/_support/db.ts";

// アクセスログや監査ログを書き出す時間で結果がぶれ、出力で結果も読みにくくなるので、ログは捨てる（JSON にする処理は計測に含める）。
// deno bench はベンチごとに console を差し替えるので、モジュールの先頭ではなく、ベンチの中で捨てる。
function discardLogs() {
  console.log = noop;
}
function noop() {}

const handler = await createApp({ mock: false });

await resetDb();
const account = await addAccount();
const loggedIn = { cookie: cookiePair(sessionCookie(await createSession(account))) };

// POST の計測に使う、ログイン前の Cookie とトークン。
const loginPage = await handler(new Request("http://localhost/login"));
const preLogin = { cookie: cookiePair(loginPage.headers.get("set-cookie")!) };
const csrfToken = (await loginPage.text()).match(/name="_csrf" value="([^"]+)"/)![1];

function postLogin(username: string, password: string) {
  return new Request("http://localhost/login", {
    method: "POST",
    headers: preLogin,
    body: new URLSearchParams({ _csrf: csrfToken, username, password }),
  });
}

// レスポンスボディを送り出すまでを含めて比べるので、ボディも最後まで読む。
async function run(req: Request) {
  discardLogs();
  const res = await handler(req);
  await res.bytes();
}

Deno.bench("GET /login（未ログイン）", { group: "handler", baseline: true }, async () => {
  await run(new Request("http://localhost/login"));
});

Deno.bench("GET /home（ログイン中）", { group: "handler" }, async () => {
  await run(new Request("http://localhost/home", { headers: loggedIn }));
});

// パスワードが上限より長いと scrypt を計算しないので、フォームのパース・CSRF・DB・画面の組み立てだけを測れる。
Deno.bench("POST /login（失敗。scrypt なし）", { group: "handler" }, async () => {
  await run(postLogin("nobody", "x".repeat(PASSWORD_MAX_LENGTH + 1)));
});

Deno.bench("POST /logout（CSRF で拒否）", { group: "handler" }, async () => {
  await run(new Request("http://localhost/logout", { method: "POST" }));
});

Deno.bench("GET /robots.txt", { group: "handler" }, async () => {
  await run(new Request("http://localhost/robots.txt"));
});

Deno.bench("GET /assets/（CSS）", { group: "handler" }, async () => {
  await run(new Request(`http://localhost${asset("web/_assets/index.css")}`));
});

Deno.bench("GET /healthz", { group: "handler" }, async () => {
  await run(new Request("http://localhost/healthz"));
});

Deno.bench("GET /nonexistent（404）", { group: "handler" }, async () => {
  await run(new Request("http://localhost/nonexistent"));
});

// 1 回に約 100 ms かかり、ほかの差が見えなくなるので、scrypt を含む経路の目安として別に測る。
Deno.bench("POST /login（成功）", { group: "login" }, async () => {
  await run(postLogin(account.username, TEST_PASSWORD));
});

// ハンドラが返す Response の形によって Deno.serve の送り方が変わるので、実際の HTTP でも測る。
const server = Deno.serve({ port: 0, hostname: "127.0.0.1", onListen() {} }, handler);
server.unref();
const origin = `http://127.0.0.1:${server.addr.port}`;

Deno.bench("HTTP GET /login（未ログイン）", { group: "http", baseline: true }, async () => {
  discardLogs();
  await (await fetch(`${origin}/login`)).bytes();
});

Deno.bench("HTTP GET /home（ログイン中）", { group: "http" }, async () => {
  discardLogs();
  await (await fetch(`${origin}/home`, { headers: loggedIn })).bytes();
});

Deno.bench("HTTP GET /healthz", { group: "http" }, async () => {
  discardLogs();
  await (await fetch(`${origin}/healthz`)).bytes();
});
