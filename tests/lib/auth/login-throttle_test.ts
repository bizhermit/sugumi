import assert from "node:assert/strict";
import { refundAttempt, reserveAttempt } from "../../../src/lib/auth/login-throttle.ts";
import { db } from "../../../src/lib/db.ts";
import {
  LOGIN_IP_LOCKOUT_MINUTES,
  LOGIN_IP_MAX_FAILED_ATTEMPTS,
  LOGIN_IP_WINDOW_MINUTES,
} from "../../../src/lib/env.ts";
import { resetDb } from "../../_support/db.ts";

const MAX = LOGIN_IP_MAX_FAILED_ATTEMPTS;
const WINDOW_MS = LOGIN_IP_WINDOW_MINUTES * 60 * 1000;
const LOCKOUT_MS = LOGIN_IP_LOCKOUT_MINUTES * 60 * 1000;
const ignore = MAX === 0;

/** address から now の時刻に count 回試し、最後の結果を返す。 */
async function reserveTimes(address: string | undefined, count: number, now: number) {
  let result;
  for (let i = 0; i < count; i++) result = await reserveAttempt(address, now);
  return result;
}

async function failedAttempts(key: string) {
  const { rows } = await db.query<{ failed_attempts: number }>(
    "SELECT failed_attempts FROM login_throttles WHERE address = $1",
    [key],
  );
  return rows.at(0)?.failed_attempts;
}

Deno.test({
  name: "login-throttle: LOGIN_IP_MAX_FAILED_ATTEMPTS 回までは試せ、超えると制限する",
  ignore,
  async fn() {
    await resetDb();
    const now = Date.now();
    assert.equal((await reserveTimes("192.0.2.1", MAX, now))?.status, "allowed");
    assert.deepEqual(await reserveAttempt("192.0.2.1", now), {
      status: "blocked",
      blocks: true,
      key: "192.0.2.1",
    });
    // 制限を始めたことは 1 回だけ返す
    assert.deepEqual(await reserveAttempt("192.0.2.1", now), {
      status: "blocked",
      blocks: false,
      key: "192.0.2.1",
    });
    // ほかの接続元は制限しない
    assert.equal((await reserveAttempt("192.0.2.2", now)).status, "allowed");
  },
});

Deno.test({
  name: "login-throttle: 並行して試しても、上限を超えて通さない",
  ignore,
  async fn() {
    await resetDb();
    const now = Date.now();
    const results = await Promise.all(
      Array.from({ length: MAX + 5 }, () => reserveAttempt("192.0.2.1", now)),
    );
    assert.equal(results.filter((r) => r.status === "allowed").length, MAX);
    assert.equal(results.filter((r) => r.status === "blocked" && r.blocks).length, 1);
  },
});

Deno.test({
  name: "login-throttle: IPv6 は /64 ごとに数え、IPv4 射影アドレスは IPv4 として数える",
  ignore,
  async fn() {
    await resetDb();
    const now = Date.now();
    await reserveTimes("2001:db8:0:1::1", MAX, now);
    assert.deepEqual(await reserveAttempt("2001:db8:0:1:ffff::2", now), {
      status: "blocked",
      blocks: true,
      key: "2001:db8:0:1::/64",
    });
    assert.equal((await reserveAttempt("2001:db8:0:2::1", now)).status, "allowed");

    await reserveTimes("::ffff:192.0.2.1", MAX, now);
    assert.equal((await reserveAttempt("192.0.2.1", now)).status, "blocked");
  },
});

Deno.test({
  name: "login-throttle: 接続元が分からないか解析できなければ数えない",
  ignore,
  async fn() {
    await resetDb();
    const now = Date.now();
    for (const address of [undefined, "unknown"]) {
      assert.deepEqual(await reserveTimes(address, MAX + 1, now), {
        status: "allowed",
        attempt: undefined,
      });
    }
    const { rows } = await db.query("SELECT * FROM login_throttles");
    assert.equal(rows.length, 0);
  },
});

Deno.test({
  name: "login-throttle: LOGIN_IP_WINDOW_MINUTES が過ぎると、最初から数え直す",
  ignore,
  async fn() {
    await resetDb();
    const start = Date.now();
    await reserveTimes("192.0.2.1", MAX, start);
    assert.equal((await reserveAttempt("192.0.2.1", start + WINDOW_MS)).status, "allowed");
    assert.equal(await failedAttempts("192.0.2.1"), 1);
  },
});

Deno.test({
  name: "login-throttle: 制限は LOGIN_IP_LOCKOUT_MINUTES で解け、最初から数え直す",
  ignore,
  async fn() {
    await resetDb();
    const start = Date.now();
    await reserveTimes("192.0.2.1", MAX + 1, start);
    const end = start + LOCKOUT_MS;
    assert.equal((await reserveAttempt("192.0.2.1", end - 1)).status, "blocked");
    assert.equal((await reserveAttempt("192.0.2.1", end)).status, "allowed");
    assert.equal(await failedAttempts("192.0.2.1"), 1);
  },
});

Deno.test({
  name: "login-throttle: refundAttempt は 1 回だけ取り消し、数え直した後の回は取り消さない",
  ignore,
  async fn() {
    await resetDb();
    const start = Date.now();
    await reserveTimes("192.0.2.1", 2, start);
    const reserved = await reserveAttempt("192.0.2.1", start);
    assert.equal(reserved.status, "allowed");
    if (reserved.status !== "allowed") return;
    await refundAttempt(reserved.attempt);
    assert.equal(await failedAttempts("192.0.2.1"), 2);

    // 期間が過ぎて数え直したあとに、前の期間の回を取り消しても変わらない
    await reserveAttempt("192.0.2.1", start + WINDOW_MS);
    await refundAttempt(reserved.attempt);
    assert.equal(await failedAttempts("192.0.2.1"), 1);
  },
});
