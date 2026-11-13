import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { authenticate, type AuthResult, createAccount } from "../../../src/features/auth/accounts.ts";
import type { DataBase } from "../../../src/lib/db.ts";
import { deleteAccounts, deleteAddressFailures, prepareTestDb } from "../helpers/db.ts";
import { TEST_LOGIN_LIMITS } from "../helpers/limits.ts";

// 試行は順番に行う必要があるので、ループの中で待つ。
/* oxlint-disable no-await-in-loop */

const PREFIX = "test-limits-";
const PASSWORD = "correct-pass";
const ADDRESSES = ["203.0.113.10", "203.0.113.11", "203.0.113.12", "203.0.113.13"] as const;

describe("login limits", () => {
  let db: DataBase;

  before(async () => {
    db = prepareTestDb();
    await deleteAccounts(db, PREFIX);
    for (const address of ADDRESSES) {
      await deleteAddressFailures(db, address);
    }
  });

  after(async () => {
    await deleteAccounts(db, PREFIX);
    for (const address of ADDRESSES) {
      await deleteAddressFailures(db, address);
    }
    await db.end();
  });

  type Options = { remoteAddress?: string; deviceToken?: string };

  function auth(username: string, password: string, options: Options = {}): Promise<AuthResult> {
    return authenticate(db, TEST_LOGIN_LIMITS, {
      username,
      password,
      remoteAddress: options.remoteAddress,
      deviceToken: options.deviceToken,
      userAgent: "test",
    });
  }

  async function accountState(username: string) {
    const { rows } = await db.query<{ failed_attempts: number; locked_until: Date | null }>(
      "SELECT failed_attempts, locked_until FROM accounts WHERE username = $1",
      [username],
    );
    assert.ok(rows[0] != null);
    return rows[0];
  }

  async function addressFailedAttempts(address: string): Promise<number> {
    const { rows } = await db.query<{ failed_attempts: number }>(
      "SELECT failed_attempts FROM login_throttles WHERE address = $1",
      [address],
    );
    return rows[0]?.failed_attempts ?? 0;
  }

  it("続けて失敗するとロックされ、正しいパスワードでも入れない。期限が過ぎれば入れる", async () => {
    const username = `${PREFIX}lock`;
    await createAccount(db, username, "ロック", PASSWORD);
    for (let i = 1; i < TEST_LOGIN_LIMITS.maxFailedAttempts; i++) {
      const result = await auth(username, "wrong-pass");
      assert.ok(result.status === "wrong_password");
      assert.equal(result.locksAccount, false);
    }
    const last = await auth(username, "wrong-pass");
    assert.ok(last.status === "wrong_password");
    assert.equal(last.locksAccount, true);
    assert.equal((await auth(username, PASSWORD)).status, "locked");

    // 期限を過去にして、ロックが明けた状態にする。
    await db.query("UPDATE accounts SET locked_until = $2 WHERE username = $1", [
      username,
      new Date(Date.now() - 1000),
    ]);
    assert.equal((await auth(username, PASSWORD)).status, "ok");
    assert.deepEqual(await accountState(username), { failed_attempts: 0, locked_until: null });
  });

  it("ロックが解除された後の失敗は1から数え直す", async () => {
    const username = `${PREFIX}recount`;
    await createAccount(db, username, "数え直し", PASSWORD);
    await db.query("UPDATE accounts SET failed_attempts = $2, locked_until = $3 WHERE username = $1", [
      username,
      TEST_LOGIN_LIMITS.maxFailedAttempts,
      new Date(Date.now() - 1000),
    ]);
    assert.equal((await auth(username, "wrong-pass")).status, "wrong_password");
    assert.equal((await accountState(username)).failed_attempts, 1);
  });

  it("接続元から失敗が続くと遮断され、正しいパスワードでも入れない。期限が過ぎれば入れる", async () => {
    const username = `${PREFIX}address`;
    const remoteAddress = ADDRESSES[0];
    await createAccount(db, username, "接続元", PASSWORD);
    for (let i = 1; i <= TEST_LOGIN_LIMITS.addressMaxFailedAttempts; i++) {
      assert.equal((await auth(`${PREFIX}nobody-${i}`, "wrong-pass", { remoteAddress })).status, "unknown_user");
    }
    // 上限を超えた試行は、パスワードを見ずに拒否する。
    const blocked = await auth(username, PASSWORD, { remoteAddress });
    assert.ok(blocked.status === "address_blocked");
    assert.equal(blocked.blocksAddress, true);
    const again = await auth(username, PASSWORD, { remoteAddress });
    assert.ok(again.status === "address_blocked");
    assert.equal(again.blocksAddress, false);
    // 別の接続元からは入れる。
    assert.equal((await auth(username, PASSWORD, { remoteAddress: ADDRESSES[1] })).status, "ok");

    await db.query("UPDATE login_throttles SET blocked_until = $2 WHERE address = $1", [
      remoteAddress,
      new Date(Date.now() - 1000),
    ]);
    assert.equal((await auth(username, PASSWORD, { remoteAddress })).status, "ok");
  });

  it("接続元の試行回数は検証の前に数え、成功したら戻す", async () => {
    const username = `${PREFIX}refund`;
    const remoteAddress = ADDRESSES[3];
    await createAccount(db, username, "戻す", PASSWORD);
    assert.equal((await auth(username, "wrong-pass", { remoteAddress })).status, "wrong_password");
    assert.equal(await addressFailedAttempts(remoteAddress), 1);
    // 成功した試行の分だけ戻る。それより前の失敗は残る。
    assert.equal((await auth(username, PASSWORD, { remoteAddress })).status, "ok");
    assert.equal(await addressFailedAttempts(remoteAddress), 1);
  });

  it("記録済みの端末からの失敗はアカウントにも接続元にも数えず、端末ごとに数える", async () => {
    const username = `${PREFIX}device`;
    const remoteAddress = ADDRESSES[2];
    await createAccount(db, username, "端末", PASSWORD);
    const first = await auth(username, PASSWORD, { remoteAddress });
    assert.ok(first.status === "ok");
    assert.equal(first.device.isNew, true);
    assert.equal(first.trustedDevice, false);
    const deviceToken = first.device.token;

    for (let i = 0; i < TEST_LOGIN_LIMITS.maxFailedAttempts; i++) {
      const result = await auth(username, "wrong-pass", { remoteAddress, deviceToken });
      assert.ok(result.status === "wrong_password");
      assert.equal(result.trustedDevice, true);
      assert.equal(result.locksAccount, false);
    }
    assert.equal((await accountState(username)).failed_attempts, 0);
    assert.equal(await addressFailedAttempts(remoteAddress), 0);

    // 上限に達した端末は、覚えていない端末と同じ扱いになる。
    const exhausted = await auth(username, "wrong-pass", { remoteAddress, deviceToken });
    assert.ok(exhausted.status === "wrong_password");
    assert.equal(exhausted.trustedDevice, false);
    assert.equal((await accountState(username)).failed_attempts, 1);

    // 成功すると同じ端末として記録され、端末の失敗回数が戻る。
    const again = await auth(username, PASSWORD, { remoteAddress, deviceToken });
    assert.ok(again.status === "ok");
    assert.equal(again.device.isNew, false);
    assert.equal(again.device.token, deviceToken);
    const retry = await auth(username, "wrong-pass", { remoteAddress, deviceToken });
    assert.ok(retry.status === "wrong_password");
    assert.equal(retry.trustedDevice, true);
  });

  it("別のアカウントの端末トークンは信頼せず、成功すると新しい端末として登録する", async () => {
    const owner = `${PREFIX}owner`;
    const other = `${PREFIX}other`;
    await createAccount(db, owner, "持ち主", PASSWORD);
    await createAccount(db, other, "別人", PASSWORD);
    const ownerLogin = await auth(owner, PASSWORD);
    assert.ok(ownerLogin.status === "ok");
    const deviceToken = ownerLogin.device.token;

    const failed = await auth(other, "wrong-pass", { deviceToken });
    assert.ok(failed.status === "wrong_password");
    assert.equal(failed.trustedDevice, false);
    const ok = await auth(other, PASSWORD, { deviceToken });
    assert.ok(ok.status === "ok");
    assert.equal(ok.device.isNew, true);
    assert.notEqual(ok.device.token, deviceToken);
  });
});
