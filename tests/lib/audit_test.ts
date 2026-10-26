import assert from "node:assert/strict";
import { audit } from "../../src/lib/audit.ts";
import { captureLogs } from "../_support/logs.ts";

const SOURCE = { requestId: "req-1", remoteAddress: "192.0.2.1" };

Deno.test("audit: リクエスト ID と接続元を付けて 1 行の JSON で出す", async () => {
  const [log] = await captureLogs(() => {
    audit("logged_out", SOURCE, { accountId: 1 });
  });
  assert.deepEqual(Object.keys(log), [
    "type",
    "time",
    "requestId",
    "event",
    "remoteAddress",
    "accountId",
  ]);
  assert.deepEqual(
    [log.type, log.requestId, log.event, log.remoteAddress, log.accountId],
    ["audit", "req-1", "logged_out", "192.0.2.1", 1],
  );
});

Deno.test("audit: 付ける項目を data で上書きしようとすると型エラーになる", () => {
  // 実行はせず、型チェックだけを確かめる
  const _check = () => {
    // @ts-expect-error: type は audit() が付ける
    audit("logged_out", SOURCE, { type: "access" });
    // @ts-expect-error: requestId は audit() が付ける
    audit("logged_out", SOURCE, { requestId: "forged" });
  };
});
