import assert from "node:assert/strict";
import { contentSecurityPolicy, withSecurityHeaders } from "../../src/web/security-headers.ts";

Deno.test("security-headers: デフォルトのヘッダーを付ける", () => {
  const { headers } = withSecurityHeaders(new Response("ok"));
  assert.equal(headers.get("content-security-policy"), contentSecurityPolicy());
  assert.equal(headers.get("x-content-type-options"), "nosniff");
  assert.equal(headers.get("cache-control"), "no-store");
  assert.equal(headers.get("strict-transport-security"), "max-age=31536000; includeSubDomains");
  assert.equal(headers.get("referrer-policy"), "same-origin");
  assert.equal(headers.get("x-frame-options"), "DENY");
  assert.equal(headers.get("cross-origin-opener-policy"), "same-origin");
  assert.equal(headers.get("cross-origin-embedder-policy"), "require-corp");
  assert.equal(headers.get("cross-origin-resource-policy"), "same-origin");
  assert.match(headers.get("permissions-policy") ?? "", /(^|, )camera=\(\)(,|$)/);
});

Deno.test("security-headers: ページが設定したヘッダーは上書きしない", async () => {
  const res = withSecurityHeaders(
    new Response("ok", {
      status: 201,
      headers: { "cache-control": "public, max-age=60", "content-security-policy": "img-src *" },
    }),
  );
  assert.equal(res.status, 201);
  assert.equal(res.headers.get("cache-control"), "public, max-age=60");
  assert.equal(res.headers.get("content-security-policy"), "img-src *");
  assert.equal(await res.text(), "ok");
});

Deno.test("security-headers: ヘッダーが変更不可の Response にも付けられる", () => {
  const res = withSecurityHeaders(Response.redirect("http://localhost/", 302));
  assert.equal(res.headers.get("x-frame-options"), "DENY");
});

Deno.test("security-headers: CSP はデフォルトを保ち、指定したディレクティブだけを置き換える", () => {
  const csp = contentSecurityPolicy();
  for (
    const directive of [
      "default-src 'none'",
      "script-src 'self'",
      "frame-ancestors 'none'",
      "require-trusted-types-for 'script'",
      "trusted-types 'none'",
    ]
  ) {
    assert.ok(csp.split("; ").includes(directive), directive);
  }
  const custom = contentSecurityPolicy({ "img-src": ["'self'", "data:"], "trusted-types": [] })
    .split("; ");
  assert.ok(custom.includes("img-src 'self' data:"));
  // 空配列のディレクティブは出力しない。
  assert.ok(!custom.some((d) => d.startsWith("trusted-types")));
  assert.ok(custom.includes("default-src 'none'"));
});
