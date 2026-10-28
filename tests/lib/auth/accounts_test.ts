import assert from "node:assert/strict";
import {
  authenticate,
  createAccount,
  findAccount,
  unlockAccount,
} from "../../../src/lib/auth/accounts.ts";
import type { CreateAccountResult } from "../../../src/lib/auth/accounts.ts";
import { sweep as sweepLoginDevices } from "../../../src/lib/auth/login-devices.ts";
import { reserveAttempt } from "../../../src/lib/auth/login-throttle.ts";
import { PASSWORD_MAX_LENGTH } from "../../../src/lib/auth/password.ts";
import { isRandomToken } from "../../../src/lib/crypto.ts";
import { db } from "../../../src/lib/db.ts";
import {
  LOGIN_DEVICE_DAYS,
  LOGIN_IP_MAX_FAILED_ATTEMPTS,
  LOGIN_LOCKOUT_MINUTES,
  LOGIN_MAX_FAILED_ATTEMPTS,
} from "../../../src/lib/env.ts";
import { addAccount, resetDb, TEST_PASSWORD } from "../../_support/db.ts";

const MAX = LOGIN_MAX_FAILED_ATTEMPTS;

async function accountRow() {
  const { rows } = await db.query<{ failed_attempts: number; locked_until: Date | null }>(
    "SELECT failed_attempts, locked_until FROM accounts",
  );
  return rows[0];
}

Deno.test("accounts: 正しいパスワードならログインでき、失敗の回数を 0 に戻す", async () => {
  await resetDb();
  const account = await addAccount();
  await authenticate("alice", "wrong password", undefined, undefined);
  const result = await authenticate("alice", TEST_PASSWORD, undefined, undefined);
  assert.ok(result.status === "ok");
  assert.deepEqual(result.account, account);
  assert.equal(result.trustedDevice, false);
  assert.deepEqual(await accountRow(), { failed_attempts: 0, locked_until: null });
});

Deno.test("accounts: パスワードの誤りと、存在しないユーザーを区別して返す", async () => {
  await resetDb();
  await addAccount();
  const wrong = await authenticate("alice", "wrong password", undefined, undefined);
  assert.equal(wrong.status, "wrong_password");
  assert.deepEqual(await authenticate("bob", TEST_PASSWORD, undefined, undefined), {
    status: "unknown_user",
  });
  // 上限を超える長さのパスワードは、ハッシュを計算せずに失敗にする（失敗の回数にも数える）。
  const long = await authenticate(
    "alice",
    "x".repeat(PASSWORD_MAX_LENGTH + 1),
    undefined,
    undefined,
  );
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
      const result = await authenticate("alice", "wrong password", undefined, undefined);
      assert.equal(result.status === "wrong_password" && result.locked, false);
    }
    const last = await authenticate("alice", "wrong password", undefined, undefined);
    assert.equal(last.status === "wrong_password" && last.locked, true);
    assert.equal(
      (await authenticate("alice", TEST_PASSWORD, undefined, undefined)).status,
      "locked",
    );
  },
});

Deno.test({
  name: "accounts: ロックは LOGIN_LOCKOUT_MINUTES が経つと解け、失敗の回数は 0 から数え直す",
  ignore: MAX === 0,
  async fn() {
    await resetDb();
    await addAccount();
    for (let i = 0; i < MAX; i++) {
      await authenticate("alice", "wrong password", undefined, undefined);
    }
    const { locked_until } = await accountRow();
    assert.ok(locked_until !== null);
    const lockout = LOGIN_LOCKOUT_MINUTES * 60 * 1000;
    assert.ok(Math.abs(locked_until.getTime() - Date.now() - lockout) < 60_000);

    await db.query("UPDATE accounts SET locked_until = $1", [new Date(Date.now() - 1)]);
    assert.equal(
      (await authenticate("alice", "wrong password", undefined, undefined)).status,
      "wrong_password",
    );
    assert.equal((await accountRow()).failed_attempts, 1);
    assert.equal((await authenticate("alice", TEST_PASSWORD, undefined, undefined)).status, "ok");
  },
});

Deno.test({
  name: "accounts: 同時に試しても、上限を超えてパスワードを確かめない",
  ignore: MAX === 0,
  async fn() {
    await resetDb();
    await addAccount();
    const results = await Promise.all(
      Array.from(
        { length: MAX + 3 },
        () => authenticate("alice", "wrong password", undefined, undefined),
      ),
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
    assert.deepEqual(await authenticate("alice", TEST_PASSWORD, "192.0.2.1", undefined), {
      status: "address_blocked",
      blocks: true,
      blockedAddress: "192.0.2.1",
    });
    // 制限中はアカウントの失敗として数えない。
    assert.equal((await accountRow()).failed_attempts, 0);
    assert.equal((await authenticate("alice", TEST_PASSWORD, "192.0.2.2", undefined)).status, "ok");
  },
});

Deno.test({
  name: "accounts: ログインに成功すると、接続元の失敗の回数を 1 回分取り消す",
  ignore: LOGIN_IP_MAX_FAILED_ATTEMPTS === 0,
  async fn() {
    await resetDb();
    await addAccount();
    await authenticate("alice", "wrong password", "192.0.2.1", undefined);
    await authenticate("alice", TEST_PASSWORD, "192.0.2.1", undefined);
    const { rows } = await db.query<{ failed_attempts: number }>(
      "SELECT failed_attempts FROM login_throttles",
    );
    assert.deepEqual(rows, [{ failed_attempts: 1 }]);
  },
});

Deno.test("accounts: createAccount は入力を確かめ、使われているユーザー名を拒否する", async () => {
  await resetDb();
  const ok = "valid password";
  const invalid: Array<[string, string, string, CreateAccountResult["status"]]> = [
    ["", "表示名", ok, "invalid_username"],
    ["a b", "表示名", ok, "invalid_username"],
    ["a\tb", "表示名", ok, "invalid_username"],
    ["a\u0000b", "表示名", ok, "invalid_username"],
    ["x".repeat(65), "表示名", ok, "invalid_username"],
    ["alice", " ", ok, "invalid_display_name"],
    ["alice", "表示名", "short", "invalid_password"],
    ["alice", "表示名", "x".repeat(129), "invalid_password"],
  ];
  for (const [username, displayName, password, status] of invalid) {
    assert.deepEqual(await createAccount(username, displayName, password), { status }, username);
  }
  const result = await createAccount("x".repeat(64), "表示名", "x".repeat(8));
  assert.ok(result.status === "ok");
  assert.equal(result.account.username.length, 64);
  assert.deepEqual(await findAccount(result.account.id), result.account);

  await addAccount("alice");
  assert.deepEqual(await createAccount("alice", "表示名", ok), { status: "username_taken" });
});

/** 失敗を重ねて alice をロックする。 */
async function lockAlice() {
  for (let i = 0; i < MAX; i++) {
    await authenticate("alice", "wrong password", undefined, undefined);
  }
  assert.equal((await authenticate("alice", TEST_PASSWORD, undefined, undefined)).status, "locked");
}

/** alice でログインに成功し、その端末のトークンを返す。 */
async function aliceDevice() {
  const result = await authenticate("alice", TEST_PASSWORD, undefined, undefined);
  assert.ok(result.status === "ok" && result.deviceToken !== undefined);
  return result.deviceToken;
}

async function deviceRows() {
  const { rows } = await db.query<{ account_id: number; failed_attempts: number }>(
    "SELECT account_id, failed_attempts FROM login_devices ORDER BY account_id",
  );
  return rows;
}

Deno.test({
  name: "accounts: ログインに成功すると、LOGIN_DEVICE_DAYS の間有効な端末のトークンを作る",
  ignore: MAX === 0,
  async fn() {
    await resetDb();
    const account = await addAccount();
    const token = await aliceDevice();
    assert.ok(isRandomToken(token));
    const { rows: [row] } = await db.query<{ account_id: number; expires_at: Date }>(
      "SELECT account_id, expires_at FROM login_devices",
    );
    assert.equal(row.account_id, account.id);
    const days = LOGIN_DEVICE_DAYS * 24 * 60 * 60 * 1000;
    assert.ok(Math.abs(row.expires_at.getTime() - Date.now() - days) < 60_000);
  },
});

Deno.test({
  name: "accounts: ロック中でも、ログインしたことのある端末からは正しいパスワードで通す",
  ignore: MAX === 0,
  async fn() {
    await resetDb();
    await addAccount();
    const token = await aliceDevice();
    await lockAlice();
    const result = await authenticate("alice", TEST_PASSWORD, undefined, token);
    assert.ok(result.status === "ok");
    assert.equal(result.trustedDevice, true);
    // 成功のたびにトークンを作り直し、前のものは使えなくする。
    assert.notEqual(result.deviceToken, token);
    assert.equal((await authenticate("alice", TEST_PASSWORD, undefined, token)).status, "locked");
    assert.equal(
      (await authenticate("alice", TEST_PASSWORD, undefined, result.deviceToken)).status,
      "ok",
    );
    // 端末からの成功では、ほかの端末に対するロックは解かない。
    assert.equal(
      (await authenticate("alice", TEST_PASSWORD, undefined, undefined)).status,
      "locked",
    );
  },
});

Deno.test({
  name: "accounts: 端末からの失敗はアカウントに数えず、上限に達した端末は信頼しない",
  ignore: MAX === 0,
  async fn() {
    await resetDb();
    await addAccount();
    const token = await aliceDevice();
    for (let i = 0; i < MAX; i++) {
      const result = await authenticate("alice", "wrong password", undefined, token);
      assert.ok(result.status === "wrong_password");
      assert.equal(result.trustedDevice, true);
      assert.equal(result.locked, false);
    }
    assert.equal((await accountRow()).failed_attempts, 0);
    // 上限に達した端末からの試行は、ほかの端末と同じくアカウントの失敗として数える。
    const next = await authenticate("alice", "wrong password", undefined, token);
    assert.ok(next.status === "wrong_password");
    assert.equal(next.trustedDevice, false);
    assert.equal((await accountRow()).failed_attempts, 1);
  },
});

Deno.test({
  name: "accounts: 端末からのログインでも、同時に試したときに上限を超えてパスワードを確かめない",
  ignore: MAX === 0,
  async fn() {
    await resetDb();
    await addAccount();
    const token = await aliceDevice();
    const results = await Promise.all(
      Array.from(
        { length: MAX + 3 },
        () => authenticate("alice", "wrong password", undefined, token),
      ),
    );
    const trusted = results.filter((r) => r.status === "wrong_password" && r.trustedDevice);
    assert.equal(trusted.length, MAX);
  },
});

Deno.test({
  name: "accounts: ほかのアカウントの端末、期限切れ、形式の違うトークンは信頼しない",
  ignore: MAX === 0,
  async fn() {
    await resetDb();
    const alice = await addAccount();
    await addAccount("bob");
    const bob = await authenticate("bob", TEST_PASSWORD, undefined, undefined);
    assert.ok(bob.status === "ok" && bob.deviceToken !== undefined);
    const expired = await aliceDevice();
    await db.query("UPDATE login_devices SET expires_at = $1 WHERE account_id = $2", [
      new Date(Date.now() - 1),
      alice.id,
    ]);
    await lockAlice();
    for (const token of [bob.deviceToken, expired, "not a token"]) {
      assert.equal((await authenticate("alice", TEST_PASSWORD, undefined, token)).status, "locked");
    }
  },
});

Deno.test({
  name: "accounts: ログインしたことのある端末からは、接続元が制限されていても通す",
  ignore: LOGIN_IP_MAX_FAILED_ATTEMPTS === 0 || MAX === 0,
  async fn() {
    await resetDb();
    await addAccount();
    const token = await aliceDevice();
    const now = Date.now();
    for (let i = 0; i <= LOGIN_IP_MAX_FAILED_ATTEMPTS; i++) await reserveAttempt("192.0.2.1", now);
    assert.equal(
      (await authenticate("alice", TEST_PASSWORD, "192.0.2.1", undefined)).status,
      "address_blocked",
    );
    assert.equal((await authenticate("alice", TEST_PASSWORD, "192.0.2.1", token)).status, "ok");
  },
});

Deno.test({
  name: "accounts: 端末のトークンは、期限切れのものと上限に達したものを消す",
  ignore: MAX === 0,
  async fn() {
    await resetDb();
    await addAccount();
    const bob = await addAccount("bob");
    const used = await aliceDevice();
    for (let i = 0; i < MAX; i++) await authenticate("alice", "wrong password", undefined, used);
    await authenticate("bob", TEST_PASSWORD, undefined, undefined);
    await db.query("UPDATE login_devices SET expires_at = $1 WHERE account_id = $2", [
      new Date(Date.now() - 1),
      bob.id,
    ]);
    await sweepLoginDevices(Date.now());
    assert.deepEqual(await deviceRows(), []);
  },
});

Deno.test({
  name: "accounts: unlockAccount はロックと失敗の回数を消し、なければ false を返す",
  ignore: MAX === 0,
  async fn() {
    await resetDb();
    const account = await addAccount();
    await lockAlice();
    assert.deepEqual(await unlockAccount(account.id), account);
    assert.deepEqual(await accountRow(), { failed_attempts: 0, locked_until: null });
    assert.equal((await authenticate("alice", TEST_PASSWORD, undefined, undefined)).status, "ok");
    assert.equal(await unlockAccount(account.id + 1), undefined);
  },
});
