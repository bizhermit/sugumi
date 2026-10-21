import assert from "node:assert/strict";
import { hashPassword, verifyPassword } from "../../../src/lib/auth/password.ts";

Deno.test("password: パラメータとソルトを含む形で保存し、同じパスワードでも毎回違う値にする", async () => {
  const a = await hashPassword("correct horse");
  const b = await hashPassword("correct horse");
  assert.match(a, /^scrypt\$32768\$8\$3\$[A-Za-z0-9_-]{22}\$[A-Za-z0-9_-]{43}$/);
  assert.notEqual(a, b);
  assert.equal(await verifyPassword("correct horse", a), true);
  assert.equal(await verifyPassword("correct horse", b), true);
  assert.equal(await verifyPassword("correct hors", a), false);
  assert.equal(await verifyPassword("", a), false);
});

Deno.test("password: Unicode の正規化（NFC）の違いは同じパスワードとして扱う", async () => {
  const composed = "café";
  const decomposed = "café";
  const hash = await hashPassword(composed);
  assert.equal(await verifyPassword(decomposed, hash), true);
});

Deno.test("password: 保存したパラメータで検証する", async () => {
  // 検証に PARAMS を使っていれば、保存したパラメータを書き換えても一致してしまう。
  // 保存したものを使うため、PARAMS を強くしても既存のハッシュをそのまま検証できる
  const weak = (await hashPassword("x")).replace(/^scrypt\$\d+\$8\$3\$/, "scrypt$1024$8$1$");
  assert.equal(await verifyPassword("x", weak), false);
});

Deno.test("password: 形式が不正なハッシュは false を返す", async () => {
  for (const hash of ["", "plain", "bcrypt$1$2$3$4$5", "scrypt$32768$8$3$c2FsdA"]) {
    assert.equal(await verifyPassword("x", hash), false, hash);
  }
});
