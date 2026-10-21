// createApp() に、テスト用のルートと静的ファイルのディレクトリを渡して確かめる。
// 実際のルートを使うテストと同じファイルに置くと、layout の対応表が置き換わるため分けている
import assert from "node:assert/strict";
import { createApp } from "../../src/web/app.ts";
import { withTempDir } from "../_support/fixture.ts";
import { handler, withFixture } from "../_support/routes.ts";

const THROW = `export default () => { throw new Error("テストで投げた例外"); };`;

Deno.test("createApp: 静的ファイルがルートか /assets/ と同じ URL になれば、例外にする", async () => {
  await withFixture(
    { "get.ts": handler("GET /"), "robots.txt/get.ts": handler("robots") },
    async (routes) => {
      await withTempDir({ "robots.txt": "x" }, async (staticDir) => {
        await assert.rejects(
          createApp({ mock: false, routes, staticDir }),
          /static\/robots\.txt: ルートか \/assets\/ と同じ URL/,
        );
      });
    },
  );
  await withFixture({ "get.ts": handler("GET /") }, async (routes) => {
    await withTempDir({ "assets/a.txt": "x" }, async (staticDir) => {
      await assert.rejects(
        createApp({ mock: false, routes, staticDir }),
        /static\/assets\/a\.txt: ルートか \/assets\/ と同じ URL/,
      );
    });
    // 重ならなければ起動できる
    await withTempDir({ "robots.txt": "x" }, async (staticDir) => {
      const app = await createApp({ mock: false, routes, staticDir });
      assert.equal(await (await app(new Request("http://localhost/robots.txt"))).text(), "x");
      assert.equal(await (await app(new Request("http://localhost/"))).text(), "GET /");
    });
  });
});

Deno.test("createApp: ページや before の例外は、セキュリティヘッダーの付いた 500 にする", async () => {
  await withFixture({
    "get.ts": handler("GET /"),
    "page/get.ts": THROW,
    "guarded/before.ts": THROW,
    "guarded/get.ts": handler("GET /guarded"),
  }, async (routes) => {
    const app = await createApp({ mock: false, routes });
    const error = console.error;
    console.error = () => {};
    try {
      for (const path of ["/page", "/guarded"]) {
        const res = await app(new Request(`http://localhost${path}`));
        assert.equal(res.status, 500, path);
        assert.equal(res.headers.get("x-frame-options"), "DENY", path);
        // 例外の内容は応答に出さない
        assert.doesNotMatch(await res.text(), /テストで投げた例外/, path);
      }
    } finally {
      console.error = error;
    }
  });
});

Deno.test("createApp: TCP の接続元を ctx.remoteAddress に渡す", async () => {
  await withFixture({
    "get.ts": `export default (_req: Request, ctx: { remoteAddress?: string }) =>
      new Response(String(ctx.remoteAddress));`,
  }, async (routes) => {
    const app = await createApp({ mock: false, routes });
    const req = () =>
      new Request("http://localhost/", { headers: { "x-forwarded-for": "192.0.2.99" } });
    const info = (hostname: string) =>
      ({ remoteAddr: { transport: "tcp", hostname, port: 1 } }) as Deno.ServeHandlerInfo;
    assert.equal(await (await app(req(), info("::ffff:192.0.2.1"))).text(), "192.0.2.1");
    assert.equal(await (await app(req())).text(), "undefined");
  });
});
