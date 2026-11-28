import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { resolveRemoteAddress } from "../../../src/web/remote-address.ts";

describe("resolveRemoteAddress", () => {
  it("プロキシを信頼しないときは接続元をそのまま使用する", () => {
    const headers = new Headers({ "x-forwarded-for": "203.0.113.9" });
    assert.equal(resolveRemoteAddress(headers, "192.0.2.1", false), "192.0.2.1");
    assert.equal(resolveRemoteAddress(headers, undefined, false), undefined);
  });

  it("プロキシを信頼するときはX-Forwarded-Forの右端を使用する", () => {
    assert.equal(
      resolveRemoteAddress(new Headers({ "x-forwarded-for": "203.0.113.9" }), "10.0.0.1", true),
      "203.0.113.9",
    );
    assert.equal(
      resolveRemoteAddress(new Headers({ "x-forwarded-for": "198.51.100.1, 203.0.113.9 " }), "10.0.0.1", true),
      "203.0.113.9",
    );
  });

  it("プロキシを信頼してもヘッダが無ければ接続元を使用する", () => {
    assert.equal(resolveRemoteAddress(new Headers(), "10.0.0.1", true), "10.0.0.1");
    assert.equal(resolveRemoteAddress(new Headers({ "x-forwarded-for": " " }), "10.0.0.1", true), "10.0.0.1");
  });

  it("IPv4射影アドレスはIPv4の表記にそろえる", () => {
    assert.equal(resolveRemoteAddress(new Headers(), "::ffff:192.0.2.1", false), "192.0.2.1");
    assert.equal(resolveRemoteAddress(new Headers(), "2001:db8::1", false), "2001:db8::1");
  });
});
