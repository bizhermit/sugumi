import { parseCidr } from "../../src/lib/ip.ts";
import { remoteAddressOf } from "../../src/web/remote-address.ts";

// 本番を想定して、信頼するプロキシの裏で X-Forwarded-For を読む。
const TRUSTED = [parseCidr("10.0.0.0/8")!, parseCidr("fd00::/8")!];
const v4 = new Request("http://localhost/", {
  headers: { "x-forwarded-for": "203.0.113.9, 198.51.100.1, 10.0.1.5" },
});
const v6 = new Request("http://localhost/", {
  headers: { "x-forwarded-for": "2001:db8:85a3::8a2e:370:7334, fd00::5" },
});

Deno.bench("IPv4（プロキシ 2 段）", { group: "remote-address", baseline: true }, () => {
  remoteAddressOf(v4, "10.0.0.1", TRUSTED);
});

Deno.bench("IPv6（プロキシ 2 段）", { group: "remote-address" }, () => {
  remoteAddressOf(v6, "fd00::1", TRUSTED);
});
