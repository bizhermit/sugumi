import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isEmail } from "../../../../src/lib/_shared/email.ts";

describe("isEmail", () => {
  it("RFC 5321のMailbox文法で判定する", () => {
    const longest = "b".repeat(63) + "." + Array.from({ length: 3 }, () => "c".repeat(62)).join(".");
    const valid = [
      "a@example.xn--p1ai",
      '"john doe"@example.com',
      '"a\\"b"@example.com',
      "a@[192.168.0.1]",
      "a@[IPv6:2001:db8::1]",
      "a@[IPv6:2001:db8:0:0:0:0:0:1]",
      "a@[IPv6:::ffff:192.168.0.1]",
      `a@${longest}.jp`,
    ];
    const invalid = [
      "a@example.123",
      "a@192.168.0.1",
      "”a”@example.com",
      "a@[192.168.0.256]",
      "a@[IPv6:2001:db8:1]",
      "a@[IPv6:2001:db8::1::2]",
      "a@[IPv6:1:2:3:4:5:6:7::]",
      "a@[IPv6:12345::1]",
      `a@${"b".repeat(64)}.jp`,
      `a@${longest}.jpx`,
      `${"a".repeat(65)}@example.com`,
      ".a@example.com",
      "a..b@example.com",
      '"a@example.com',
      '"@example.com',
      '"a\\"@example.com',
      '"a@example.com"',
      '"a@b@example.com',
      '"a"."b"@example.com',
    ];
    for (const value of valid) assert.equal(isEmail(value), true, value);
    for (const value of invalid) assert.equal(isEmail(value), false, value);
  });
});
