import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { authenticate, createAccount } from "../../../src/features/auth/accounts.ts";
import type { DataBase } from "../../../src/lib/db.ts";
import { deleteAccounts, prepareTestDb } from "../helpers/db.ts";
import { TEST_LOGIN_LIMITS } from "../helpers/limits.ts";

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

  function auth(username: string, password: string) {
    return authenticate(db, TEST_LOGIN_LIMITS, {
      username,
      password,
      remoteAddress: undefined,
      deviceToken: undefined,
      userAgent: "",
    });
  }

  it("ユーザー名とパスワードが一致すればアカウントを返す", async () => {
    const result = await auth(`${PREFIX}user1`, "correct-pass");
    assert.ok(result.status === "ok");
    assert.equal(result.account.username, `${PREFIX}user1`);
    assert.equal(result.account.displayName, "テストユーザー１");
    assert.equal(typeof result.account.id, "number");
  });

  it("パスワードが違えばwrong_password", async () => {
    assert.equal((await auth(`${PREFIX}user1`, "wrong-pass")).status, "wrong_password");
  });

  it("ユーザーが無ければunknown_user", async () => {
    assert.equal((await auth(`${PREFIX}nobody`, "correct-pass")).status, "unknown_user");
  });

  it("上限より長いパスワードは呼び出し側の検証漏れなので例外", async () => {
    await assert.rejects(auth(`${PREFIX}user1`, "x".repeat(129)), /上限/);
  });

  it("同じユーザー名のアカウントは作成できない", async () => {
    await assert.rejects(createAccount(db, `${PREFIX}user1`, "重複", "another-pass"), /duplicate key/);
  });
});
