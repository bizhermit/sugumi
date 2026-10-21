import assert from "node:assert/strict";
import { parseTrustedProxies } from "../../src/lib/env.ts";
import { remoteAddressOf } from "../../src/web/remote-address.ts";

const PROXIES = parseTrustedProxies("10.0.0.1,10.0.1.0/24,2001:db8::/32");

function addressOf(tcp: string | undefined, forwarded?: string): string | undefined {
  const headers: Record<string, string> = forwarded === undefined
    ? {}
    : { "x-forwarded-for": forwarded };
  return remoteAddressOf(new Request("http://localhost/", { headers }), tcp, PROXIES);
}

Deno.test("remote-address: 信頼するプロキシでない接続元からは、X-Forwarded-For を読まない", () => {
  assert.equal(addressOf("192.0.2.1", "198.51.100.1"), "192.0.2.1");
  assert.equal(addressOf("::ffff:192.0.2.1"), "192.0.2.1");
  assert.equal(addressOf("2001:DB9:0::1"), "2001:db9::1");
  assert.equal(addressOf(undefined, "198.51.100.1"), undefined);
  assert.equal(addressOf("not an ip"), undefined);
  // TRUSTED_PROXIES の既定（未設定）では、プロキシを信頼しない
  assert.equal(
    remoteAddressOf(
      new Request("http://localhost/", { headers: { "x-forwarded-for": "198.51.100.1" } }),
      "10.0.0.1",
      [],
    ),
    "10.0.0.1",
  );
});

Deno.test("remote-address: 信頼するプロキシからは、右から読んで最初の信頼しないアドレスを使う", () => {
  // 左の値は利用者が書いたものなので読まない
  assert.equal(addressOf("10.0.0.1", "203.0.113.9, 198.51.100.1"), "198.51.100.1");
  // プロキシを何段通しても、信頼するものは飛ばす
  assert.equal(addressOf("10.0.0.1", "198.51.100.1, 10.0.1.5,10.0.1.6"), "198.51.100.1");
  assert.equal(addressOf("2001:db8::1", "2001:db9::5"), "2001:db9::5");
  // ヘッダーがなければ、プロキシのアドレスのまま
  assert.equal(addressOf("10.0.0.1"), "10.0.0.1");
  // すべて信頼するプロキシなら、いちばん左のもの
  assert.equal(addressOf("10.0.0.1", "10.0.1.7"), "10.0.1.7");
});

Deno.test("remote-address: 解析できない値に当たったら、最後に確かめたプロキシのアドレスを使う", () => {
  assert.equal(addressOf("10.0.0.1", "198.51.100.1, unknown"), "10.0.0.1");
  assert.equal(addressOf("10.0.0.1", "198.51.100.1, 10.0.1.5, "), "10.0.0.1");
  assert.equal(addressOf("10.0.0.1", "198.51.100.1, garbage, 10.0.1.5"), "10.0.1.5");
  assert.equal(addressOf("10.0.0.1", "198.51.100.1,,10.0.1.5"), "10.0.1.5");
  assert.equal(addressOf("10.0.0.1", ",198.51.100.1"), "198.51.100.1");
});

Deno.test("remote-address: プロキシが付けたポートを取り除き、表記を揃える", () => {
  assert.equal(addressOf("10.0.0.1", "198.51.100.1:51234"), "198.51.100.1");
  assert.equal(addressOf("10.0.0.1", "[2001:DB9::5]:443"), "2001:db9::5");
  assert.equal(addressOf("10.0.0.1", "[2001:db9::5]"), "2001:db9::5");
  assert.equal(addressOf("10.0.0.1", "::ffff:198.51.100.1"), "198.51.100.1");
});
