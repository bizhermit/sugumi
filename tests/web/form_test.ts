import assert from "node:assert/strict";
import { parseForm } from "../../src/web/form.ts";

function post(body: BodyInit, type?: string) {
  return new Request("http://localhost/", {
    method: "POST",
    headers: type ? { "content-type": type } : {},
    body,
  });
}

Deno.test("form: 同じ Request は 1 回だけパースし、同じ結果を返す", async () => {
  const req = post(new URLSearchParams({ a: "1" }));
  const first = parseForm(req);
  assert.equal(parseForm(req), first);
  assert.equal((await first)?.get("a"), "1");
  // クローンしてから読むので、標準の API でもリクエストボディを読める。
  assert.equal((await req.formData()).get("a"), "1");
});

Deno.test("form: フォームの形式でないボディや、パースできないボディは undefined にする", async () => {
  assert.equal(await parseForm(post("a=1", "text/plain")), undefined);
  assert.equal(await parseForm(post("a=1", "application/json")), undefined);
  assert.equal(await parseForm(post("壊れたボディ", "multipart/form-data; boundary=x")), undefined);
  assert.equal(await parseForm(new Request("http://localhost/")), undefined);
});

Deno.test("form: multipart/form-data もパースする", async () => {
  const body = new FormData();
  body.set("name", "<a>");
  assert.equal((await parseForm(post(body)))?.get("name"), "<a>");
});
