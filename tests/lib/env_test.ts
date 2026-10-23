import assert from "node:assert/strict";
import {
  parseAppMode,
  parseDatabaseUrl,
  parseInteger,
  parseListenHost,
  parseTrustedProxies,
} from "../../src/lib/env.ts";
import { formatIp } from "../../src/lib/ip.ts";
import { withTempDir } from "../_support/fixture.ts";

Deno.test("env: 整数は、未設定なら既定値にし、min 以上の整数でなければ例外にする", () => {
  assert.equal(parseInteger("X", undefined, 30, 0), 30);
  assert.equal(parseInteger("X", "", 30, 0), 30);
  assert.equal(parseInteger("X", "0", 30, 0), 0);
  assert.equal(parseInteger("X", "720", 30, 1), 720);
  for (const raw of ["-1", "1.5", "1e3", " 1", "0x10", "abc", "99999999999999999999"]) {
    assert.throws(() => parseInteger("X", raw, 30, 0), /環境変数 X は 0 以上の整数/, raw);
  }
  assert.throws(() => parseInteger("X", "0", 30, 1), /環境変数 X は 1 以上の整数/);
});

Deno.test("env: APP_MODE は、未設定なら PROD にし、決まった値でなければ例外にする", () => {
  assert.equal(parseAppMode(undefined), "PROD");
  assert.equal(parseAppMode(""), "PROD");
  for (const mode of ["PROD", "DEV", "MOCK"]) assert.equal(parseAppMode(mode), mode);
  for (const raw of ["prod", "TEST", " DEV"]) {
    assert.throws(() => parseAppMode(raw), /APP_MODE は PROD・DEV・MOCK のどれか/, raw);
  }
});

Deno.test("env: TRUSTED_PROXIES は、カンマ区切りの IP アドレスと CIDR を読む", () => {
  assert.deepEqual(parseTrustedProxies(undefined), []);
  assert.deepEqual(parseTrustedProxies(" "), []);
  const proxies = parseTrustedProxies("192.0.2.10, 10.0.1.0/24,2001:db8::/32");
  assert.deepEqual(
    proxies.map((c) => `${formatIp(c.bytes)}/${c.prefix}`),
    ["192.0.2.10/32", "10.0.1.0/24", "2001:db8::/32"],
  );
});

Deno.test("env: TRUSTED_PROXIES に解析できない値や、広すぎる範囲があれば例外にする", () => {
  for (const raw of ["proxy", "192.0.2.10,", "10.0.0.5/8", "192.0.2.256"]) {
    assert.throws(
      () => parseTrustedProxies(raw),
      /IP アドレスか CIDR（ホスト部が 0）でない値/,
      raw,
    );
  }
  // 全体を信頼する書き間違いを防ぐ。分けて書いても 1 つずつ断る
  for (const raw of ["0.0.0.0/0", "0.0.0.0/1,128.0.0.0/1", "10.0.0.0/7", "::/0", "2001:db8::/31"]) {
    assert.throws(() => parseTrustedProxies(raw), /範囲が広すぎます/, raw);
  }
  assert.equal(parseTrustedProxies("10.0.0.0/8,2001:db8::/32").length, 2);
});

Deno.test("env: DATABASE_URL は必須で、パスワードはファイルからも読める", async () => {
  assert.throws(() => parseDatabaseUrl(undefined, undefined), /DATABASE_URL を設定してください/);
  assert.throws(() => parseDatabaseUrl("", undefined), /DATABASE_URL を設定してください/);
  const raw = "postgres://app@db:5432/app";
  assert.equal(parseDatabaseUrl(raw, undefined), raw);
  assert.equal(parseDatabaseUrl(raw, ""), raw);

  await withTempDir({
    password: "p@ss/w%rd:#\n\n",
    empty: "\n",
  }, (dir) => {
    const file = (name: string) => decodeURIComponent(new URL(name, dir).pathname);
    // 末尾の改行は取り除き、URL で意味を持つ文字はエンコードする
    const url = new URL(parseDatabaseUrl(raw, file("password")));
    assert.equal(decodeURIComponent(url.password), "p@ss/w%rd:#");
    assert.equal(url.username, "app");
    assert.equal(url.host, "db:5432");
    assert.equal(url.pathname, "/app");

    assert.throws(() => parseDatabaseUrl(raw, file("empty")), /ファイルが空です/);
    assert.throws(
      () => parseDatabaseUrl("postgres://app:secret@db:5432/app", file("password")),
      /両方でパスワードを指定しています/,
    );
  });
});

Deno.test("env: 待ち受けるアドレスは、未設定なら 0.0.0.0 にし、IP アドレスでなければ例外にする", () => {
  assert.equal(parseListenHost(undefined), "0.0.0.0");
  assert.equal(parseListenHost(""), "0.0.0.0");
  assert.equal(parseListenHost("127.0.0.1"), "127.0.0.1");
  assert.equal(parseListenHost("::1"), "::1");
  for (const raw of ["localhost", "example.com", "127.0.0.1:3000", " 127.0.0.1"]) {
    assert.throws(() => parseListenHost(raw), /LISTEN_HOST/, raw);
  }
});
