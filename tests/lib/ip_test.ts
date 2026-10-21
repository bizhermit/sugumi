import assert from "node:assert/strict";
import { cidrContains, formatIp, parseCidr, parseIp } from "../../src/lib/ip.ts";

/** 解析して表記を揃えた文字列。解析できなければ undefined。 */
function normalize(text: string): string | undefined {
  const bytes = parseIp(text);
  return bytes && formatIp(bytes);
}

Deno.test("ip: IPv4 を解析し、先頭の 0 や範囲外の値は受け付けない", () => {
  assert.equal(normalize("192.0.2.1"), "192.0.2.1");
  assert.equal(normalize("0.0.0.0"), "0.0.0.0");
  assert.equal(normalize("255.255.255.255"), "255.255.255.255");
  // 先頭の 0 は 8 進数と解釈する実装があり、別のアドレスを指しうる
  for (
    const text of [
      "192.0.2.01",
      "010.0.0.1",
      "256.0.0.1",
      "1.2.3",
      "1.2.3.4.5",
      "1.2.3.-1",
      "",
      "a.b.c.d",
      "1.2.3.4 ",
    ]
  ) {
    assert.equal(parseIp(text), undefined, text);
  }
});

Deno.test("ip: IPv6 を解析し、RFC 5952 の表記に揃える", () => {
  const cases: [string, string][] = [
    ["2001:DB8:0:0:0:0:0:1", "2001:db8::1"],
    ["2001:0db8::0001", "2001:db8::1"],
    ["::", "::"],
    ["::1", "::1"],
    ["1::", "1::"],
    // 最も長い 0 の連続を省き、同じ長さなら前のほうを省く
    ["2001:0:0:1:0:0:0:1", "2001:0:0:1::1"],
    ["2001:db8:0:0:1:0:0:1", "2001:db8::1:0:0:1"],
    // 1 つだけの 0 は省かない
    ["2001:db8:0:1:1:1:1:1", "2001:db8:0:1:1:1:1:1"],
    ["64:ff9b::192.0.2.1", "64:ff9b::c000:201"],
  ];
  for (const [text, expected] of cases) assert.equal(normalize(text), expected, text);
});

Deno.test("ip: IPv4 射影アドレスは IPv4 にする", () => {
  assert.equal(normalize("::ffff:192.0.2.1"), "192.0.2.1");
  assert.equal(normalize("::FFFF:c000:0201"), "192.0.2.1");
  assert.equal(parseIp("::ffff:192.0.2.1")?.length, 4);
});

Deno.test("ip: 不正な IPv6 は受け付けない", () => {
  for (
    const text of [
      "1::2::3",
      "1:2:3:4:5:6:7:8:9",
      "1:2:3:4:5:6:7",
      "1:2:3:4:5:6:7::8",
      "12345::1",
      "g::1",
      ":1:2:3:4:5:6:7",
      "::192.0.2.01",
      "::1.2.3.4:5",
      "[::1]",
      "fe80::1%eth0",
    ]
  ) {
    assert.equal(parseIp(text), undefined, text);
  }
});

Deno.test("ip: CIDR はホスト部が 0 のものだけを受け付ける", () => {
  assert.deepEqual(parseCidr("10.0.0.0/8"), { bytes: Uint8Array.from([10, 0, 0, 0]), prefix: 8 });
  assert.equal(parseCidr("192.0.2.1")?.prefix, 32);
  assert.equal(parseCidr("2001:db8::")?.prefix, 128);
  assert.equal(parseCidr("2001:db8::/32")?.prefix, 32);
  assert.equal(parseCidr("0.0.0.0/0")?.prefix, 0);
  for (
    const text of [
      "10.0.0.5/8",
      "10.0.0.0/33",
      "2001:db8::/129",
      "10.0.0.0/08",
      "10.0.0.0/",
      "10.0.0.0/8/8",
      "10.0.0.0/-1",
      // IPv4 射影アドレスに IPv6 のプレフィックス長を付けると、IPv4 の長さと合わなくなる
      "::ffff:10.0.0.0/104",
    ]
  ) {
    assert.equal(parseCidr(text), undefined, text);
  }
});

Deno.test("ip: cidrContains はプレフィックスのビットだけを比べ、IPv4 と IPv6 は互いに含まない", () => {
  const contains = (cidr: string, ip: string) => cidrContains(parseCidr(cidr)!, parseIp(ip)!);
  assert.equal(contains("10.0.1.0/24", "10.0.1.255"), true);
  assert.equal(contains("10.0.1.0/24", "10.0.2.0"), false);
  assert.equal(contains("172.16.0.0/12", "172.31.255.255"), true);
  assert.equal(contains("172.16.0.0/12", "172.32.0.0"), false);
  assert.equal(contains("192.0.2.10", "192.0.2.10"), true);
  assert.equal(contains("192.0.2.10", "192.0.2.11"), false);
  assert.equal(contains("2001:db8::/32", "2001:db8:ffff::1"), true);
  assert.equal(contains("2001:db8::/33", "2001:db8:8000::1"), false);
  assert.equal(contains("0.0.0.0/0", "::1"), false);
  assert.equal(contains("::/0", "192.0.2.1"), false);
});
