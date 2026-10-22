// createApp() に、テスト用のルートと静的ファイルのディレクトリを渡して確かめる。
// 実際のルートを使うテストと同じファイルに置くと、layout の対応表が置き換わるため分けている
import assert from "node:assert/strict";
import { createApp } from "../../src/web/app.ts";
import { withTempDir } from "../_support/fixture.ts";
import { calls, handler, withFixture } from "../_support/routes.ts";

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

Deno.test("createApp: ページが同じ Response を 2 回返したら、2 回目は書き換えずに 500 にする", async () => {
  // 基盤はヘッダーをその場で書き足すため、使い回すと 1 回目の利用者の Cookie が 2 回目の応答に混ざる
  const shared = `const res = new Response(null, { status: 302, headers: { location: "/" } });
export default async (_req: Request, ctx: { csrfToken: () => Promise<string> }) => {
  await ctx.csrfToken();
  return res;
};`;
  await withFixture({ "get.ts": handler("GET /"), "shared/get.ts": shared }, async (routes) => {
    const app = await createApp({ mock: false, routes });
    const first = await app(new Request("http://localhost/shared"));
    assert.equal(first.status, 302);
    assert.match(first.headers.get("set-cookie") ?? "", /^__Host-csrf=/);
    const error = console.error;
    console.error = () => {};
    try {
      const second = await app(new Request("http://localhost/shared"));
      assert.equal(second.status, 500);
      assert.equal(second.headers.get("set-cookie"), null);
      assert.equal(second.headers.get("x-frame-options"), "DENY");
      await second.body?.cancel();
    } finally {
      console.error = error;
    }
  });
});

// ctx の値を JSON で返すページ。分割代入で取り出しても動くことも確かめる
const CTX_PAGE = `export default async (req: Request, ctx: any) => {
  const { csrfToken, form, query, remoteAddress } = ctx;
  const token = await csrfToken();
  const values = req.method === "POST" ? Object.fromEntries(await form()) : null;
  return Response.json({ token, again: await ctx.csrfToken(), values, q: query.get("q"), remoteAddress });
};`;
// ctx.form() で解析した後でも、標準の req.formData() を使えることを確かめるページ
const STANDARD_FORM_PAGE = `export default async (req: Request, ctx: any) => {
  const parsed = await ctx.form();
  const standard = await req.formData();
  return Response.json({ parsed: parsed.get("name"), standard: standard.get("name") });
};`;

Deno.test("createApp: ctx から分割代入で取り出しても使え、フォームは CSRF の検証で解析したものを受け取る", async () => {
  await withFixture({
    "get.ts": handler("GET /"),
    "ctx/get.ts": CTX_PAGE,
    "ctx/post.ts": CTX_PAGE,
    "standard/post.ts": STANDARD_FORM_PAGE,
  }, async (routes) => {
    const app = await createApp({ mock: false, routes });
    const info = {
      remoteAddr: { transport: "tcp", hostname: "192.0.2.1", port: 1 },
      completed: Promise.resolve(),
    } as const;
    const res = await app(new Request("http://localhost/ctx?q=%E3%81%82"), info);
    const got = await res.json();
    assert.equal(got.again, got.token);
    assert.equal(got.q, "あ");
    assert.equal(got.remoteAddress, "192.0.2.1");
    // token() を何度呼んでも、ログイン前の Cookie は 1 つだけ発行する
    const setCookie = res.headers.get("set-cookie") ?? "";
    assert.equal(setCookie.split("__Host-csrf=").length, 2);

    const cookie = setCookie.split(";")[0];
    const body = new URLSearchParams({ _csrf: got.token, name: "<a>" });
    const posted = await (await app(
      new Request("http://localhost/ctx", { method: "POST", headers: { cookie }, body }),
    )).json();
    assert.deepEqual(posted.values, { _csrf: got.token, name: "<a>" });

    const standard = await app(
      new Request("http://localhost/standard", { method: "POST", headers: { cookie }, body }),
    );
    assert.deepEqual(await standard.json(), { parsed: "<a>", standard: "<a>" });
  });
});

Deno.test("createApp: ctx.form() で解析できない本文には、ページの代わりに 400 を返す", async () => {
  await withFixture({
    "get.ts": handler("GET /"),
    "ctx/get.ts": CTX_PAGE,
    "ctx/post.ts": CTX_PAGE,
  }, async (routes) => {
    const app = await createApp({ mock: false, routes });
    const page = await app(new Request("http://localhost/ctx"));
    const { token } = await page.json();
    const cookie = (page.headers.get("set-cookie") ?? "").split(";")[0];
    // トークンをヘッダーで送り、CSRF の検証は通す
    for (
      const [type, body] of [
        ["text/plain", "name=x"],
        ["multipart/form-data; boundary=x", "壊れた本文"],
      ]
    ) {
      const res = await app(
        new Request("http://localhost/ctx", {
          method: "POST",
          headers: { cookie, "x-csrf-token": token, "content-type": type },
          body,
        }),
      );
      assert.equal(res.status, 400, type);
      assert.equal(res.headers.get("x-frame-options"), "DENY", type);
      await res.body?.cancel();
    }
  });
});

Deno.test("createApp: 本文が締め切りまでに届かなければ、ページを呼ばずに 408 を返し、本文を読むのをやめる", async () => {
  await withFixture(
    { "get.ts": handler("GET /"), "post.ts": handler("POST /") },
    async (routes) => {
      // 既定の REQUEST_BODY_TIMEOUT_SECONDS を待たずに確かめるため、締め切りを短くして渡す
      const app = await createApp({ mock: false, routes, bodyTimeoutMs: 50 });
      let canceled = false;
      // 最初の塊だけ送り、残りを送らないまま接続を開けておくクライアント
      const body = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(new TextEncoder().encode("_csrf="));
        },
        cancel() {
          canceled = true;
        },
      });
      const res = await app(new Request("http://localhost/", { method: "POST", body }));
      assert.equal(res.status, 408);
      assert.equal(res.headers.get("x-frame-options"), "DENY");
      assert.ok(canceled);
      assert.deepEqual(calls, []);
      await res.body?.cancel();
    },
  );
});
