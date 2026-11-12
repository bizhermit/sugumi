import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { authenticate, createAccount } from "../../../src/features/auth/accounts.ts";
import type { DataBase } from "../../../src/lib/db.ts";
import { deleteAccounts, prepareTestDb } from "../helpers/db.ts";

const PREFIX = "test-accounts-";

describe("accounts", () => {
  let db: DataBase;

  before(async () => {
    db = prepareTestDb();
    await deleteAccounts(db, PREFIX);
    await createAccount(db, `${PREFIX}user1`, "テストユーザー１", "correct-pass");
  });

  after(async () => {
    await deleteAccounts(db, PREFIX);
    await db.end();
  });

  it("ユーザー名とパスワードが一致すればアカウントを返す", async () => {
    const account = await authenticate(db, `${PREFIX}user1`, "correct-pass");
    assert.ok(account != null);
    assert.equal(account.username, `${PREFIX}user1`);
    assert.equal(account.displayName, "テストユーザー１");
    assert.equal(typeof account.id, "number");
  });

  it("パスワードが違えばundefined", async () => {
    assert.equal(await authenticate(db, `${PREFIX}user1`, "wrong-pass"), undefined);
  });

  it("ユーザーが無ければundefined", async () => {
    assert.equal(await authenticate(db, `${PREFIX}nobody`, "correct-pass"), undefined);
  });

  it("上限より長いパスワードは検証せずundefined", async () => {
    assert.equal(await authenticate(db, `${PREFIX}user1`, "x".repeat(129)), undefined);
  });

  it("同じユーザー名のアカウントは作成できない", async () => {
    await assert.rejects(createAccount(db, `${PREFIX}user1`, "重複", "another-pass"), /duplicate key/);
  });
});
