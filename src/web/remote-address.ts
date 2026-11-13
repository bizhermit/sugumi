import { slot } from "./slot.ts";

export const remoteAddressSlot = slot<string | undefined>("remoteAddress");

/**
 * 接続元のIPアドレスを返す。
 * trustProxyがtrueなら、リバースプロキシが付けたX-Forwarded-Forの右端の値を使う。
 * nginxは接続元で上書きし（値は1つ）、AWSのALBは右端に追記するので、どちらも右端が本当の接続元になる。
 * X-Forwarded-Forは利用者も送れるので、プロキシを通らずに届く構成ではtrueにしてはならない。
 */
export function resolveRemoteAddress(
  headers: Headers,
  socketAddress: string | undefined,
  trustProxy: boolean,
): string | undefined {
  if (trustProxy) {
    const forwarded = headers.get("x-forwarded-for");
    if (forwarded != null) {
      const last = forwarded.slice(forwarded.lastIndexOf(",") + 1).trim();
      if (last !== "") {
        return normalize(last);
      }
    }
  }
  return socketAddress == null ? undefined : normalize(socketAddress);
}

/** IPv4射影アドレス（::ffff:192.0.2.1）はIPv4の表記にそろえる。 */
function normalize(address: string): string {
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(address);
  return mapped?.[1] ?? address;
}
