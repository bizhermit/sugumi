import assert from "node:assert/strict";
import { loadStatic } from "../../src/web/static.ts";
import { withTempDir } from "../_support/fixture.ts";

const ROBOTS = await Deno.readTextFile(new URL("../../static/robots.txt", import.meta.url));

const statics = await loadStatic();

function serve(path: string, init?: RequestInit): Response | undefined {
  const url = new URL(`http://localhost${path}`);
  return statics.serve(new Request(url, init), url);
}

Deno.test("static: static/ のファイルを、同じパスの URL で配信する", async () => {
  assert.deepEqual(statics.paths().toSorted(), ["/favicon.ico", "/robots.txt"]);
  const res = serve("/robots.txt");
  assert.equal(res?.status, 200);
  assert.equal(res.headers.get("content-type"), "text/plain; charset=utf-8");
  assert.equal(await res.text(), ROBOTS);
  assert.equal(serve("/favicon.ico")?.headers.get("content-type"), "image/x-icon");
  assert.equal(serve("/nothing.txt"), undefined);
  assert.equal(serve("/static/robots.txt"), undefined);
});

Deno.test("static: URL にハッシュを付けられないので、毎回 ETag で確かめさせる", async () => {
  const res = serve("/robots.txt");
  const etag = res?.headers.get("etag");
  assert.ok(etag);
  assert.equal(res?.headers.get("cache-control"), "no-cache");
  await res?.body?.cancel();

  const cached = serve("/robots.txt", { headers: { "if-none-match": etag } });
  assert.equal(cached?.status, 304);
  assert.equal(cached?.body, null);
  const changed = serve("/robots.txt", { headers: { "if-none-match": `"other"` } });
  assert.equal(changed?.status, 200);
  await changed?.body?.cancel();
});

Deno.test("static: HEAD にはレスポンスボディを返さず、GET・HEAD 以外には 405 を返す", async () => {
  const head = serve("/robots.txt", { method: "HEAD" });
  assert.equal(head?.status, 200);
  assert.equal(head?.body, null);
  const post = serve("/robots.txt", { method: "POST" });
  assert.equal(post?.status, 405);
  assert.equal(post?.headers.get("allow"), "GET, HEAD");
  await post?.body?.cancel();
});

Deno.test("static: . で始まるものは .well-known/ だけを配信し、名前はセグメントごとにエンコードする", async () => {
  await withTempDir({
    "robots.txt": "x",
    ".DS_Store": "x",
    ".hidden/a.txt": "x",
    "a/.secret.txt": "x",
    ".well-known/security.txt": "x",
    "あ い.txt": "x",
    "icons/app.png": new Uint8Array([0x89]),
    "app.webmanifest": "{}",
  }, async (dir) => {
    const loaded = await loadStatic(dir);
    assert.deepEqual(loaded.paths().toSorted(), [
      "/%E3%81%82%20%E3%81%84.txt",
      "/.well-known/security.txt",
      "/app.webmanifest",
      "/icons/app.png",
      "/robots.txt",
    ]);
    const url = new URL("http://localhost/%E3%81%82%20%E3%81%84.txt");
    assert.equal(await loaded.serve(new Request(url), url)?.text(), "x");
  });
});

Deno.test("static: 配信できない種類のファイルがあれば、読み込むときに例外になる", async () => {
  // HTML・SVG・XML はこのオリジンでスクリプトを実行できる文書になる。
  for (const name of ["index.html", "logo.svg", "sitemap.xml", "README", "a/b.js"]) {
    await withTempDir({ [name]: "x" }, async (dir) => {
      await assert.rejects(loadStatic(dir), /この種類のファイルは配信できません/, name);
    });
  }
  await assert.rejects(
    loadStatic(new URL("../../dist/test/nothing/", import.meta.url)),
    /static\/ がありません/,
  );
});
