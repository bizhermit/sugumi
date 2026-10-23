/**
 * e2e/ のテストを、テスト用の DB で起動したアプリに対して実行する。
 * 引数は、e2e/ の deno test にそのまま渡す（ファイルの指定や --filter）。
 *
 *   deno task test:e2e [deno test の引数]
 *
 * 環境変数 E2E_BASE_URL があれば、アプリを起動せず、そこで動いているアプリに対して実行する。
 * そのアプリは TEST_DATABASE_URL と同じ DB に接続しておく。CI は本番のイメージを起動して渡す。
 * E2E_BASE_URL は、このマシンのアプリ（127.0.0.1・localhost・[::1]）だけを受け付ける（parseBaseUrl()）。
 *
 * e2e/ のテストはアプリを外から操作するだけで、DB を触らない。
 * 使うデータはここで用意し、接続先とアカウントを環境変数で渡す（e2e/_support/browser.ts）。
 */
import { db } from "../src/lib/db.ts";
import { addAccount, resetDb, TEST_PASSWORD } from "../tests/_support/db.ts";

const ROOT = new URL("../", import.meta.url);
// e2e/deno.json の permissions で、ここだけを読み書きできるようにしている
const TMP_PARENT = new URL("dist/e2e/", ROOT);
const READY_TIMEOUT_MS = 30_000;
const LOOPBACK_HOSTS: ReadonlySet<string> = new Set(["127.0.0.1", "localhost", "[::1]"]);
// e2e/ のテストとブラウザには、DB の接続先などを渡さず、Deno と Playwright が動くのに要るものだけを渡す。
// 足したら、deno.json の permissions の test-e2e の env.allow にも足すこと
const PASSED_ENV = [
  "PATH",
  "HOME",
  "DENO_DIR",
  "XDG_CACHE_HOME",
  "PLAYWRIGHT_BROWSERS_PATH",
  "TERM",
  "NO_COLOR",
  "LANG",
  "LC_ALL",
  "TZ",
  "CI",
];

if (import.meta.main) {
  // DB を空にする前に確かめる
  const external = Deno.env.get("E2E_BASE_URL");
  Deno.exit(await runE2e(Deno.args, external ? parseBaseUrl(external) : undefined));
}

async function runE2e(args: string[], externalUrl: string | undefined): Promise<number> {
  await resetDb();
  const account = await addAccount();
  await db.end();

  // Playwright がブラウザのプロファイルなどを作る場所。実行ごとに分け、終わったら消す
  await Deno.mkdir(TMP_PARENT, { recursive: true });
  const tmp = await Deno.makeTempDir({ dir: decodeURIComponent(TMP_PARENT.pathname) });
  // appExited は、起動したアプリが終わったら reject する。外のアプリに対して実行するときは settle しない
  const runTests = async (baseUrl: string, appExited: Promise<never>) => {
    await Promise.race([waitUntilReady(new URL("/healthz", baseUrl), READY_TIMEOUT_MS), appExited]);
    const tests = new Deno.Command("deno", {
      args: ["task", "test", ...args],
      cwd: new URL("e2e/", ROOT),
      clearEnv: true,
      env: {
        ...passedEnv(),
        E2E_BASE_URL: baseUrl,
        E2E_USERNAME: account.username,
        E2E_PASSWORD: TEST_PASSWORD,
        TMPDIR: tmp,
      },
    }).spawn();
    try {
      return await Promise.race([tests.status.then(({ code }) => code), appExited]);
    } finally {
      kill(tests);
      await tests.status;
    }
  };
  try {
    if (externalUrl) return await runTests(externalUrl, new Promise<never>(() => {}));
    const port = freePort();
    // 本番と同じ起動のしかたにする（権限も deno.json の permissions.default になる）
    const app = new Deno.Command("deno", {
      args: ["run", "-P", "src/main.ts"],
      cwd: ROOT,
      // テストの間だけ、LAN からテスト用の DB のアプリに届かないようにする
      env: { APP_MODE: "PROD", PORT: String(port), LISTEN_HOST: "127.0.0.1" },
      // 監査のログでテストの結果が読みにくくならないよう、標準出力だけ捨てる
      stdout: "null",
    }).spawn();
    // 起動に失敗したり、テストの途中で終わったりしたら、待たずに失敗にする。
    // freePort() のあとでポートを別のプロセスに取られたときも、アプリが AddrInUse で終わるため、
    // そのプロセスに対してテストを続けない
    const appExited = app.status.then(({ code }) => {
      throw new Error(`アプリが終わりました（終了コード ${code}）`);
    });
    try {
      return await runTests(`http://127.0.0.1:${port}`, appExited);
    } finally {
      kill(app);
      await app.status;
    }
  } finally {
    await Deno.remove(tmp, { recursive: true });
  }
}

/**
 * E2E_BASE_URL の値を確かめ、オリジンを返す。このマシンの http・https の URL でなければ例外を投げる。
 * テストは固定のテスト用のアカウントで何度もログインするため、本番やステージングに向けると、
 * 同じ名前のアカウントや、接続元ごとの制限で同じ接続元の利用者までロックさせてしまう。
 */
export function parseBaseUrl(raw: string): string {
  let url: URL | undefined;
  try {
    url = new URL(raw);
  } catch {
    // 下で例外にする
  }
  if (
    url === undefined || (url.protocol !== "http:" && url.protocol !== "https:") ||
    !LOOPBACK_HOSTS.has(url.hostname)
  ) {
    throw new Error(
      `E2E_BASE_URL は、このマシンのアプリ（127.0.0.1・localhost・[::1]）の URL にしてください: ${raw}`,
    );
  }
  return url.origin;
}

function passedEnv(): Record<string, string> {
  const env: Record<string, string> = {};
  for (const name of PASSED_ENV) {
    const value = Deno.env.get(name);
    if (value !== undefined) env[name] = value;
  }
  return env;
}

/** すでに終わったプロセスに kill() すると例外になり、元の例外を上書きするため、終わっていれば何もしない。 */
function kill(process: Deno.ChildProcess): void {
  try {
    process.kill("SIGTERM");
  } catch (e) {
    if (!(e instanceof TypeError)) throw e;
  }
}

/** 空いているポートを返す。閉じてから使うまでの間に、ほかのプロセスに取られることはありうる。 */
export function freePort(): number {
  const listener = Deno.listen({ hostname: "127.0.0.1", port: 0 });
  const { port } = listener.addr as Deno.NetAddr;
  listener.close();
  return port;
}

/** url が 200 を返すまで待つ。timeoutMs を過ぎたら例外を投げる。 */
export async function waitUntilReady(url: URL, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (true) {
    try {
      const res = await fetch(url);
      await res.body?.cancel();
      if (res.status === 200) return;
    } catch {
      // 起動するまでは接続を拒否される
    }
    if (Date.now() > deadline) throw new Error(`${url} が ${timeoutMs} ms で応答しません`);
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
}
