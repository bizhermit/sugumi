import assert from "node:assert/strict";
import { logError } from "../../src/lib/log.ts";
import { captureLogs } from "../_support/logs.ts";

Deno.test("log: 例外の内容は、JSON にして 8 KB までに切る", async () => {
  // 日本語は UTF-8 で 1 文字 3 バイト、制御文字は JSON で 6 文字になるので、文字数で切っても収まらない。
  for (const message of ["a".repeat(20_000), "あ".repeat(20_000), "\u0001".repeat(20_000)]) {
    const [log] = await captureLogs(() => logError(new Error(message), "req-1"));
    const error = String(log.error);
    assert.ok(new TextEncoder().encode(JSON.stringify(error)).byteLength <= 8 * 1024);
    assert.ok(error.startsWith("Error: "));
    assert.equal(log.requestId, "req-1");
  }
});

Deno.test("log: 短い例外の内容は切らない", async () => {
  const [log] = await captureLogs(() => logError("短いエラー"));
  assert.equal(log.error, "短いエラー");
  assert.equal(log.type, "error");
});
