import assert from "node:assert/strict";
import { errorPage, methodNotAllowed } from "../../src/web/error-page.tsx";

Deno.test("error-page: ステータスごとの HTML を返し、レスポンスは毎回新しく作る", async () => {
  const first = errorPage(404);
  const second = errorPage(404);
  assert.notEqual(first, second);
  assert.equal(first.status, 404);
  assert.equal(first.headers.get("content-type"), "text/html; charset=utf-8");
  assert.match(await first.text(), /<h1>404<\/h1>/);
  assert.equal(await second.text(), await errorPage(404).text());
  assert.match(await errorPage(500).text(), /<h1>500<\/h1>/);
});

Deno.test("error-page: 405 の Allow は、そのレスポンスだけに付ける", () => {
  assert.equal(methodNotAllowed(["GET", "HEAD"]).headers.get("allow"), "GET, HEAD");
  // ヘッダーを使い回すと、前のレスポンスで追加したヘッダーが残ってしまう。
  assert.equal(errorPage(405).headers.get("allow"), null);
  assert.equal(methodNotAllowed(["POST"]).headers.get("allow"), "POST");
});
