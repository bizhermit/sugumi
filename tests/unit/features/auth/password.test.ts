import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { hashPassword, verifyPassword } from "../../../../src/features/auth/password.ts";

describe("password", () => {
  it("正しいパスワードを検証できる", async () => {
    const hash = await hashPassword("correct horse");
    assert.match(hash, /^scrypt\$32768\$8\$3\$[A-Za-z0-9_-]+\$[A-Za-z0-9_-]+$/);
    assert.equal(await verifyPassword("correct horse", hash), true);
  });

  it("違うパスワードは拒否する", async () => {
    const hash = await hashPassword("correct horse");
    assert.equal(await verifyPassword("correct horsf", hash), false);
    assert.equal(await verifyPassword("", hash), false);
  });

  it("同じパスワードでもハッシュは毎回変わる", async () => {
    assert.notEqual(await hashPassword("same"), await hashPassword("same"));
  });

  it("符号化の違う同じ文字列は同じパスワードとして扱う", async () => {
    const hash = await hashPassword("が");
    assert.equal(await verifyPassword("が", hash), true);
  });

  it("形式が不正なハッシュはfalseを返す", async () => {
    assert.equal(await verifyPassword("x", ""), false);
    assert.equal(await verifyPassword("x", "bcrypt$abc"), false);
    assert.equal(await verifyPassword("x", "scrypt$32768$8$3"), false);
  });
});
