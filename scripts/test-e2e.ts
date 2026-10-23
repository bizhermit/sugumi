/**
 * e2e/ のテストを、テスト用の DB で起動したアプリに対して実行する。
 * 引数は、e2e/ の deno test にそのまま渡す（ファイルの指定や --filter）。
 *
 *   deno task test:e2e [deno test の引数]
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

if (import.meta.main) {
  Deno.exit(await runE2e(Deno.args));
}

async function runE2e(args: string[]): Promise<number> {
  await resetDb();
  const account = await addAccount();
  await db.end();

  // Playwright がブラウザのプロファイルなどを作る場所。実行ごとに分け、終わったら消す
  await Deno.mkdir(TMP_PARENT, { recursive: true });
  const tmp = await Deno.makeTempDir({ dir: decodeURIComponent(TMP_PARENT.pathname) });
  try {
    const port = freePort();
    const baseUrl = `http://127.0.0.1:${port}`;
    // 本番と同じ起動のしかたにする（権限も deno.json の permissions.default になる）
    const app = new Deno.Command("deno", {
      args: ["run", "-P", "src/main.ts"],
      cwd: ROOT,
      env: { APP_MODE: "PROD", PORT: String(port) },
      // 監査のログでテストの結果が読みにくくならないよう、標準出力だけ捨てる
      stdout: "null",
    }).spawn();
    try {
      await waitUntilReady(new URL("/healthz", baseUrl), READY_TIMEOUT_MS);
      const tests = new Deno.Command("deno", {
        args: ["task", "test", ...args],
        cwd: new URL("e2e/", ROOT),
        env: {
          E2E_BASE_URL: baseUrl,
          E2E_USERNAME: account.username,
          E2E_PASSWORD: TEST_PASSWORD,
          TMPDIR: tmp,
        },
      }).spawn();
      return (await tests.status).code;
    } finally {
      app.kill("SIGTERM");
      await app.status;
    }
  } finally {
    await Deno.remove(tmp, { recursive: true });
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
