import assert from "node:assert/strict";
import { freePort, waitUntilReady } from "../../scripts/test-e2e.ts";

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

Deno.test("test-e2e: waitUntilReady() は、応答がないまま時間を過ぎたら例外を投げる", async () => {
  const url = new URL(`http://127.0.0.1:${freePort()}/healthz`);
  await assert.rejects(waitUntilReady(url, 300), /300 ms で応答しません/);
});

Deno.test("test-e2e: e2e/ のライブラリは、ルートの deno.lock に入っていない", async () => {
  // ルートの deno.lock にある npm のパッケージは、使っていなくても本番のイメージの deno cache が取得する
  const root = new URL("../../", import.meta.url);
  const { imports } = JSON.parse(await Deno.readTextFile(new URL("e2e/deno.json", root)));
  const lock = JSON.parse(await Deno.readTextFile(new URL("deno.lock", root)));
  const locked = Object.keys(lock.npm ?? {});
  const names = Object.values<string>(imports).flatMap((specifier) => {
    const name = /^npm:\/?((?:@[^/]+\/)?[^/@]+)/.exec(specifier)?.[1];
    return name === undefined ? [] : [name];
  });
  assert.ok(names.length > 0);
  assert.deepEqual(names.filter((name) => locked.some((key) => key.startsWith(`${name}@`))), []);
});
