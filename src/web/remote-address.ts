import { type Cidr, cidrContains, formatIp, parseIp } from "../lib/ip.ts";
import { TRUSTED_PROXIES } from "../lib/env.ts";

/**
 * ユーザーの IP アドレスを、formatIp の表記で返す。tcpAddress は TCP の接続元で、パースできなければ undefined を返す。
 * 表記を揃えるのは、経路やプロキシによってアドレスの書き方が変わっても、同じアドレスを同じ文字列にするため。
 * X-Forwarded-For はユーザーが書き換えられるので、TCP の接続元が信頼するプロキシのときだけ読む。
 * 信頼するプロキシは、受けた接続元を右端に追記する。そこで右から読み、信頼するプロキシでない最初のアドレスを使う。
 * それより左は、ユーザーが送ってきた値そのままなので読まない。
 * trustedProxies のデフォルトは環境変数 TRUSTED_PROXIES の値で、テストでは別の値を渡す。
 */
export function remoteAddressOf(
  req: Request,
  tcpAddress: string | undefined,
  trustedProxies: ReadonlyArray<Cidr> = TRUSTED_PROXIES,
): string | undefined {
  if (tcpAddress === undefined) return undefined;
  let ip = parseIp(tcpAddress);
  if (!ip) return undefined;
  if (!isTrustedProxy(ip, trustedProxies)) {
    return formatIp(ip);
  }
  const header = req.headers.get("x-forwarded-for");
  if (header === null) {
    return formatIp(ip);
  }
  // リクエストごとに読むので、split() で配列を作らずに、右の , から順に探す。
  let end = header.length;
  for (;;) {
    const start = end === 0 ? -1 : header.lastIndexOf(",", end - 1);
    const forwarded = parseIp(withoutPort(header.slice(start + 1, end).trim()));
    // 信頼するプロキシはパースできる値しか書かないので、ここから左はユーザーが送った値。
    if (!forwarded) break;
    ip = forwarded;
    if (!isTrustedProxy(ip, trustedProxies) || start === -1) break;
    end = start;
  }
  return formatIp(ip);
}

// リクエストごとに呼ぶので、some() にコールバックを渡さず、ループで調べる。
function isTrustedProxy(ip: Uint8Array, trustedProxies: ReadonlyArray<Cidr>) {
  for (const cidr of trustedProxies) {
    if (cidrContains(cidr, ip)) return true;
  }
  return false;
}

// Azure Application Gateway など、ポートを付けて追記するプロキシもある。
function withoutPort(entry: string) {
  const bracketed = /^\[([^\]]+)\](?::\d+)?$/.exec(entry);
  if (bracketed) {
    return bracketed[1];
  }
  const v4WithPort = /^([\d.]+):\d+$/.exec(entry);
  return v4WithPort ? v4WithPort[1] : entry;
}
