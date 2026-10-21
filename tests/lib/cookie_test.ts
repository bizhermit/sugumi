import assert from "node:assert/strict";
import { clearHostCookie, hostCookie, readCookie } from "../../src/lib/cookie.ts";

function withCookie(cookie: string): Request {
  return new Request("http://localhost/", { headers: { cookie } });
}

Deno.test("cookie: 他のオリジンから上書きされず、スクリプトから読めない属性を付ける", () => {
  assert.equal(
    hostCookie("__Host-sid", "abc"),
    "__Host-sid=abc; Path=/; Secure; HttpOnly; SameSite=Lax",
  );
  assert.equal(
    clearHostCookie("__Host-sid"),
    "__Host-sid=; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=0",
  );
});

Deno.test("cookie: 名前が一致する Cookie の値を読む", () => {
  const req = withCookie("a=1; __Host-sid=abc;b=2");
  assert.equal(readCookie(req, "__Host-sid"), "abc");
  assert.equal(readCookie(req, "a"), "1");
  assert.equal(readCookie(req, "b"), "2");
  // 前方一致や、値のないものは読まない
  assert.equal(readCookie(withCookie("__Host-sidx=abc"), "__Host-sid"), undefined);
  assert.equal(readCookie(withCookie("x__Host-sid=abc"), "__Host-sid"), undefined);
  assert.equal(readCookie(withCookie("__Host-sid="), "__Host-sid"), undefined);
  assert.equal(readCookie(withCookie("__Host-sid"), "__Host-sid"), undefined);
  assert.equal(readCookie(new Request("http://localhost/"), "__Host-sid"), undefined);
  // 同じ名前が複数あれば、最初のものを使う
  assert.equal(readCookie(withCookie("a=1; a=2"), "a"), "1");
});
