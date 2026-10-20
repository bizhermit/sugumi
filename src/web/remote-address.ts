import { cidrContains, formatIp, parseIp } from "../lib/ip.ts";
import { TRUSTED_PROXIES } from "../lib/env.ts";

/**
 * 利用者の IP アドレスを、formatIp の表記で返す。tcpAddress は TCP の接続元で、解析できなければ undefined を返す。
 * 表記を揃えるのは、届く経路やプロキシによって同じアドレスの書き方が変わっても、同じ文字列にするため。
 * X-Forwarded-For は利用者が書き換えられるため、TCP の接続元が信頼するプロキシのときだけ読む。
 * 信頼するプロキシは、受けた接続元を右端に追記する。そのため右から読み、信頼するプロキシでない最初のアドレスを使う。
 * それより左は、利用者が送ってきた値のままのため読まない。
 */
export function remoteAddressOf(req: Request, tcpAddress: string | undefined): string | undefined {
  if (tcpAddress === undefined) return undefined;
  let ip = parseIp(tcpAddress);
  if (!ip) return undefined;
  if (!isTrustedProxy(ip)) return formatIp(ip);
  const header = req.headers.get("x-forwarded-for");
  if (header === null) return formatIp(ip);
  for (const entry of header.split(",").reverse()) {
    const forwarded = parseIp(withoutPort(entry.trim()));
    // 信頼するプロキシは解析できる値しか書かないため、これより左は利用者が送った値
    if (!forwarded) break;
    ip = forwarded;
    if (!isTrustedProxy(ip)) break;
  }
  return formatIp(ip);
}

function isTrustedProxy(ip: Uint8Array): boolean {
  return TRUSTED_PROXIES.some((cidr) => cidrContains(cidr, ip));
}

// Azure Application Gateway など、ポートを付けて追記するプロキシがあるため
function withoutPort(entry: string): string {
  const bracketed = /^\[([^\]]+)\](?::\d+)?$/.exec(entry);
  if (bracketed) return bracketed[1];
  const v4WithPort = /^([\d.]+):\d+$/.exec(entry);
  return v4WithPort ? v4WithPort[1] : entry;
}
