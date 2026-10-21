import assert from "node:assert/strict";
import { authenticate, createAccount, findAccount } from "../../../src/lib/auth/accounts.ts";
import { reserveAttempt } from "../../../src/lib/auth/login-throttle.ts";
import { PASSWORD_MAX_LENGTH } from "../../../src/lib/auth/password.ts";
import { db } from "../../../src/lib/db.ts";
import {
  LOGIN_IP_MAX_FAILED_ATTEMPTS,
  LOGIN_LOCKOUT_MINUTES,
  LOGIN_MAX_FAILED_ATTEMPTS,
} from "../../../src/lib/env.ts";
import { addAccount, resetDb, TEST_PASSWORD } from "../../_support/db.ts";

const MAX = LOGIN_MAX_FAILED_ATTEMPTS;

async function accountRow(): Promise<{ failed_attempts: number; locked_until: Date | null }> {
  const { rows } = await db.query("SELECT failed_attempts, locked_until FROM accounts");
  return rows[0];
}

Deno.test("accounts: 正しいパスワードならログインでき、失敗の回数を 0 に戻す", async () => {
  await resetDb();
  const account = await addAccount();
  await authenticate("alice", "wrong password", undefined);
  assert.deepEqual(await authenticate("alice", TEST_PASSWORD, undefined), {
    status: "ok",
    account,
  });
  assert.deepEqual(await accountRow(), { failed_attempts: 0, locked_until: null });
});

Deno.test("accounts: パスワードの誤りと、存在しないユーザーを区別して返す", async () => {
  await resetDb();
  await addAccount();
  const wrong = await authenticate("alice", "wrong password", undefined);
  assert.equal(wrong.status, "wrong_password");
  assert.deepEqual(await authenticate("bob", TEST_PASSWORD, undefined), {
    status: "unknown_user",
  });
  // 上限を超える長さは、計算せずに失敗にする（失敗として数える）
  const long = await authenticate("alice", "x".repeat(PASSWORD_MAX_LENGTH + 1), undefined);
  assert.equal(long.status, "wrong_password");
  assert.equal((await accountRow()).failed_attempts, MAX === 0 ? 0 : 2);
});

Deno.test({
  name:
    "accounts: LOGIN_MAX_FAILED_ATTEMPTS 回続けて失敗するとロックし、正しいパスワードでも通さない",
  ignore: MAX === 0,
  async fn() {
    await resetDb();
    await addAccount();
    for (let i = 1; i < MAX; i++) {
      const result = await authenticate("alice", "wrong password", undefined);
      assert.equal(result.status === "wrong_password" && result.locked, false);
    }
    const last = await authenticate("alice", "wrong password", undefined);
    assert.equal(last.status === "wrong_password" && last.locked, true);
    assert.equal((await authenticate("alice", TEST_PASSWORD, undefined)).status, "locked");
  },
});

Deno.test({
  name: "accounts: ロックは LOGIN_LOCKOUT_MINUTES で解け、失敗の回数は数え直す",
  ignore: MAX === 0,
  async fn() {
    await resetDb();
    await addAccount();
    for (let i = 0; i < MAX; i++) await authenticate("alice", "wrong password", undefined);
    const { locked_until } = await accountRow();
    assert.ok(locked_until !== null);
    const lockout = LOGIN_LOCKOUT_MINUTES * 60 * 1000;
    assert.ok(Math.abs(locked_until.getTime() - Date.now() - lockout) < 60_000);

    await db.query("UPDATE accounts SET locked_until = $1", [new Date(Date.now() - 1)]);
    assert.equal(
      (await authenticate("alice", "wrong password", undefined)).status,
      "wrong_password",
    );
    assert.equal((await accountRow()).failed_attempts, 1);
    assert.equal((await authenticate("alice", TEST_PASSWORD, undefined)).status, "ok");
  },
});

Deno.test({
  name: "accounts: 並行して試しても、上限を超えてパスワードを確かめない",
  ignore: MAX === 0,
  async fn() {
    await resetDb();
    await addAccount();
    const results = await Promise.all(
      Array.from({ length: MAX + 3 }, () => authenticate("alice", "wrong password", undefined)),
    );
    assert.equal(results.filter((r) => r.status === "wrong_password").length, MAX);
    assert.equal(results.filter((r) => r.status === "locked").length, 3);
  },
});

Deno.test({
  name: "accounts: 接続元が制限されていれば、正しいパスワードでも通さない",
  ignore: LOGIN_IP_MAX_FAILED_ATTEMPTS === 0,
  async fn() {
    await resetDb();
    await addAccount();
    const now = Date.now();
    for (let i = 0; i < LOGIN_IP_MAX_FAILED_ATTEMPTS; i++) await reserveAttempt("192.0.2.1", now);
    assert.deepEqual(await authenticate("alice", TEST_PASSWORD, "192.0.2.1"), {
      status: "address_blocked",
      blocks: true,
      blockedAddress: "192.0.2.1",
    });
    // 制限中はアカウントの失敗として数えない
    assert.equal((await accountRow()).failed_attempts, 0);
    assert.equal((await authenticate("alice", TEST_PASSWORD, "192.0.2.2")).status, "ok");
  },
});

Deno.test({
  name: "accounts: ログインに成功すると、接続元の失敗の回数を 1 回取り消す",
  ignore: LOGIN_IP_MAX_FAILED_ATTEMPTS === 0,
  async fn() {
    await resetDb();
    await addAccount();
    await authenticate("alice", "wrong password", "192.0.2.1");
    await authenticate("alice", TEST_PASSWORD, "192.0.2.1");
    const { rows } = await db.query("SELECT failed_attempts FROM login_throttles");
    assert.deepEqual(rows, [{ failed_attempts: 1 }]);
  },
});

Deno.test("accounts: createAccount は入力を確かめ、使われているユーザー名を断る", async () => {
  await resetDb();
  const ok = "valid password";
  const invalid: [string, string, string, RegExp][] = [
    ["", "表示名", ok, /ユーザー名は空白を含まない 64 文字以内/],
    ["a b", "表示名", ok, /ユーザー名は空白を含まない/],
    ["a\tb", "表示名", ok, /ユーザー名は空白を含まない/],
    ["a\u0000b", "表示名", ok, /ユーザー名は空白を含まない/],
    ["x".repeat(65), "表示名", ok, /64 文字以内/],
    ["alice", " ", ok, /表示名を入力してください/],
    ["alice", "表示名", "short", /パスワードは 8 文字以上 128 文字以内/],
    ["alice", "表示名", "x".repeat(129), /パスワードは 8 文字以上 128 文字以内/],
  ];
  for (const [username, displayName, password, error] of invalid) {
    await assert.rejects(createAccount(username, displayName, password), error, username);
  }
  const account = await createAccount("x".repeat(64), "表示名", "x".repeat(8));
  assert.equal(account.username.length, 64);
  assert.deepEqual(await findAccount(account.id), account);

  await addAccount("alice");
  await assert.rejects(addAccount("alice"), /ユーザー名 alice は使われています/);
});
