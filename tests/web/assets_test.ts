// dist/public/ を読み込むため、先に deno task build が要る
import assert from "node:assert/strict";
import { asset, assetsOf, serveAsset } from "../../src/web/assets.ts";

const COMMON_JS = "web/_assets/index.js";

function serve(path: string, init?: RequestInit): Response {
  const url = new URL(`http://localhost${path}`);
  return serveAsset(new Request(url, init), url);
}

Deno.test("assets: asset() は内容のハッシュを v に付けた URL を返す", () => {
  assert.match(asset(COMMON_JS), /^\/assets\/web\/_assets\/index\.js\?v=[0-9a-f]{16}$/);
  assert.throws(() => asset("web/_assets/nothing.js"), /dist\/public\/ にありません/);
});

Deno.test("assets: assetsOf() は、ページと同じディレクトリの _assets/ のエントリーを返す", () => {
  const routes = new URL("../../src/routes/", import.meta.url);
  const login = assetsOf(new URL("login/view.tsx", routes).href);
  assert.match(login.style ?? "", /^\/assets\/routes\/login\/_assets\/index\.css\?v=/);
  assert.match(login.script ?? "", /^\/assets\/routes\/login\/_assets\/index\.js\?v=/);
  // home は JS だけ、ルートは _assets/ がない
  const home = assetsOf(new URL("home/get.tsx", routes).href);
  assert.equal(home.style, undefined);
  assert.match(home.script ?? "", /^\/assets\/routes\/home\/_assets\/index\.js\?v=/);
  assert.deepEqual(assetsOf(new URL("get.ts", routes).href), {
    style: undefined,
    script: undefined,
  });
  assert.throws(() => assetsOf(import.meta.url), /src\/ の外にあります/);
});

Deno.test("assets: v が内容と一致すればずっとキャッシュさせ、そうでなければ毎回確かめさせる", async () => {
  const current = serve(asset(COMMON_JS));
  assert.equal(current.status, 200);
  assert.equal(current.headers.get("content-type"), "text/javascript; charset=utf-8");
  assert.equal(current.headers.get("cache-control"), "public, max-age=31536000, immutable");
  await current.body?.cancel();

  for (const path of [`/assets/${COMMON_JS}`, `/assets/${COMMON_JS}?v=0000000000000000`]) {
    const res = serve(path);
    assert.equal(res.headers.get("cache-control"), "no-cache", path);
    await res.body?.cancel();
  }
});

Deno.test("assets: ETag が一致すれば 304 を返す", async () => {
  const res = serve(asset(COMMON_JS));
  const etag = res.headers.get("etag");
  assert.ok(etag);
  await res.body?.cancel();
  const cached = serve(asset(COMMON_JS), { headers: { "if-none-match": etag } });
  assert.equal(cached.status, 304);
  assert.equal(cached.body, null);
});

Deno.test("assets: ソースマップと、ないファイルは 404 にする", async () => {
  for (const path of [`/assets/${COMMON_JS}.map`, "/assets/web/_assets/nothing.js", "/assets/"]) {
    const res = serve(path);
    assert.equal(res.status, 404, path);
    await res.body?.cancel();
  }
});

Deno.test("assets: HEAD には本文を返さず、GET・HEAD 以外には 405 を返す", async () => {
  const head = serve(asset(COMMON_JS), { method: "HEAD" });
  assert.equal(head.status, 200);
  assert.equal(head.body, null);
  const post = serve(asset(COMMON_JS), { method: "POST" });
  assert.equal(post.status, 405);
  assert.equal(post.headers.get("allow"), "GET, HEAD");
  await post.body?.cancel();
});
