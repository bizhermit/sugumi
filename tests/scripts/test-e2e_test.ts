import assert from "node:assert/strict";
import { freePort, parseBaseUrl, waitUntilReady } from "../../scripts/test-e2e.ts";

Deno.test("test-e2e: freePort() は、待ち受けられるポートを返す", () => {
  const port = freePort();
  const listener = Deno.listen({ hostname: "127.0.0.1", port });
  listener.close();
});

Deno.test("test-e2e: waitUntilReady() は、200 を返すまで待つ", async () => {
  let count = 0;
  const server = Deno.serve(
    { hostname: "127.0.0.1", port: 0, onListen() {} },
    () => new Response(null, { status: ++count < 3 ? 503 : 200 }),
  );
  try {
    await waitUntilReady(new URL(`http://127.0.0.1:${server.addr.port}/`), 5_000);
    assert.equal(count, 3);
  } finally {
    await server.shutdown();
  }
});

Deno.test("test-e2e: waitUntilReady() は、レスポンスがないまま時間を過ぎたら例外を投げる", async () => {
  const url = new URL(`http://127.0.0.1:${freePort()}/healthz`);
  await assert.rejects(waitUntilReady(url, 300), /300 ms で応答しません/);
});

Deno.test("test-e2e: parseBaseUrl() は、このマシンの http・https の URL だけを受け付ける", () => {
  assert.equal(parseBaseUrl("http://127.0.0.1:3000"), "http://127.0.0.1:3000");
  assert.equal(parseBaseUrl("http://localhost:3000/home"), "http://localhost:3000");
  assert.equal(parseBaseUrl("https://[::1]:8443"), "https://[::1]:8443");
  for (
    const raw of [
      "http://example.com",
      "https://staging.example.com:3000",
      "http://127.0.0.1.example.com",
      "http://127.0.0.1@example.com",
      "http://10.0.0.1:3000",
      "file:///etc/passwd",
      "127.0.0.1:3000",
    ]
  ) {
    assert.throws(() => parseBaseUrl(raw), /E2E_BASE_URL/, raw);
  }
});

Deno.test("test-e2e: e2e/ の依存は、ルートの deno.lock に入っていない", async () => {
  // ルートの deno.lock にあるパッケージは、使っていなくても本番のイメージの deno cache が取得する。
  // 直接の依存だけでなく、推移的な依存（playwright-core など）と jsr: のパッケージも確かめる。
  const root = new URL("../../", import.meta.url);
  const packages = async (path: string) => {
    const lock = JSON.parse(await Deno.readTextFile(new URL(path, root)));
    // キーは「名前@バージョン」。スコープ付きの名前は @ で始まるので、最後の @ で分ける。
    return new Set(
      [...Object.keys(lock.npm ?? {}), ...Object.keys(lock.jsr ?? {})]
        .map((key) => key.slice(0, key.lastIndexOf("@"))),
    );
  };
  const e2e = await packages("e2e/deno.lock");
  const app = await packages("deno.lock");
  assert.ok(e2e.has("playwright"));
  assert.deepEqual([...e2e].filter((name) => app.has(name)), []);
});
