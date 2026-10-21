import assert from "node:assert/strict";
import { randomToken, timingSafeEqual } from "../../src/lib/crypto.ts";

Deno.test("crypto: randomToken は URL に使える 256 ビットの値を、毎回違う値で返す", () => {
  const tokens = new Set(Array.from({ length: 100 }, randomToken));
  assert.equal(tokens.size, 100);
  for (const token of tokens) assert.match(token, /^[A-Za-z0-9_-]{43}$/);
});

Deno.test("crypto: timingSafeEqual は長さと内容がすべて一致するときだけ true を返す", () => {
  assert.equal(timingSafeEqual("abc", "abc"), true);
  assert.equal(timingSafeEqual("", ""), true);
  assert.equal(timingSafeEqual("abc", "abd"), false);
  assert.equal(timingSafeEqual("abc", "ab"), false);
  assert.equal(timingSafeEqual("ab", "abc"), false);
  assert.equal(timingSafeEqual("abc", ""), false);
  assert.equal(timingSafeEqual("é", "e"), false);
});
