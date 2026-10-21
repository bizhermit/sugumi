import assert from "node:assert/strict";
import { serveStatic, staticPaths } from "../../src/web/static.ts";

const ROBOTS = await Deno.readTextFile(new URL("../../static/robots.txt", import.meta.url));

function serve(path: string, init?: RequestInit): Response | undefined {
  const url = new URL(`http://localhost${path}`);
  return serveStatic(new Request(url, init), url);
}

Deno.test("static: static/ のファイルを、同じパスの URL で配信する", async () => {
  assert.deepEqual(staticPaths().toSorted(), ["/favicon.ico", "/robots.txt"]);
  const res = serve("/robots.txt");
  assert.equal(res?.status, 200);
  assert.equal(res.headers.get("content-type"), "text/plain; charset=utf-8");
  assert.equal(await res.text(), ROBOTS);
  assert.equal(serve("/favicon.ico")?.headers.get("content-type"), "image/x-icon");
  assert.equal(serve("/nothing.txt"), undefined);
  assert.equal(serve("/static/robots.txt"), undefined);
});

Deno.test("static: URL にハッシュを付けられないため、毎回 ETag で確かめさせる", async () => {
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

Deno.test("static: HEAD には本文を返さず、GET・HEAD 以外には 405 を返す", async () => {
  const head = serve("/robots.txt", { method: "HEAD" });
  assert.equal(head?.status, 200);
  assert.equal(head?.body, null);
  const post = serve("/robots.txt", { method: "POST" });
  assert.equal(post?.status, 405);
  assert.equal(post?.headers.get("allow"), "GET, HEAD");
  await post?.body?.cancel();
});
