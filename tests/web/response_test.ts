import assert from "node:assert/strict";
import { editHeaders } from "../../src/web/response.ts";

function setX(headers: Headers, value: string) {
  headers.set("x-test", value);
}

Deno.test("response: ヘッダーを変更できる Response は、コピーせずに書き換える", async () => {
  const res = new Response("ok");
  const out = editHeaders(res, setX, "1");
  assert.equal(out, res);
  assert.equal(out.headers.get("x-test"), "1");
  assert.equal(await out.text(), "ok");
});

Deno.test("response: ヘッダーが変更不可の Response は、コピーして書き換え、元は変えない", () => {
  const res = Response.redirect("http://localhost/", 302);
  const out = editHeaders(res, setX, "1");
  assert.notEqual(out, res);
  assert.equal(out.status, 302);
  assert.equal(out.headers.get("location"), "http://localhost/");
  assert.equal(out.headers.get("x-test"), "1");
  assert.equal(res.headers.get("x-test"), null);
});

Deno.test("response: ヘッダーの変更不可以外の例外は、そのまま投げる", () => {
  function fail() {
    throw new RangeError("テストで投げた例外");
  }
  assert.throws(() => editHeaders(new Response("ok"), fail, undefined), RangeError);
});
