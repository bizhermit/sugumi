/** bytes は IPv4 なら 4 バイト、IPv6 なら 16 バイト。prefix より後ろのビット（ホスト部）は 0。 */
export type Cidr = { bytes: Uint8Array; prefix: number };

/**
 * IP アドレスをバイト列にする。解析できなければ undefined を返す。
 * IPv4 射影アドレス（::ffff:192.0.2.1）は IPv4 の 4 バイトにする。
 * デュアルスタックで待ち受けると、IPv4 の接続元がこの形で届くため。
 */
export function parseIp(text: string): Uint8Array | undefined {
  if (!text.includes(":")) return parseIpv4(text);
  const bytes = parseIpv6(text);
  if (
    bytes && bytes.subarray(0, 10).every((b) => b === 0) && bytes[10] === 0xff && bytes[11] === 0xff
  ) {
    return bytes.slice(12);
  }
  return bytes;
}

/** `192.0.2.0/24` や `2001:db8::/32`、`/` のない単独のアドレスを解析する。解析できなければ undefined を返す。 */
export function parseCidr(text: string): Cidr | undefined {
  const [address, prefixText, ...rest] = text.split("/");
  if (rest.length > 0) return undefined;
  const bytes = parseIp(address);
  if (!bytes) return undefined;
  if (prefixText === undefined) return { bytes, prefix: bytes.length * 8 };
  // IPv4 射影アドレスは parseIp で 4 バイトになり、IPv6 のつもりのプレフィックス長と合わなくなるため、IPv4 で書かせる
  if (address.includes(":") && bytes.length === 4) return undefined;
  if (!/^(?:0|[1-9]\d*)$/.test(prefixText)) return undefined;
  const prefix = Number(prefixText);
  if (prefix > bytes.length * 8) return undefined;
  // 範囲の書き方を 1 通りにし、10.0.0.5/8 のような書き間違いを見逃さないため、ホスト部が 0 でないものは受け付けない
  for (let bit = prefix; bit < bytes.length * 8; bit++) {
    if (bytes[bit >> 3] & (0x80 >> (bit & 7))) return undefined;
  }
  return { bytes, prefix };
}

/**
 * parseIp の戻り値を文字列にする。同じアドレスは常に同じ文字列になる。
 * IPv6 は RFC 5952 の表記（小文字、先頭の 0 を省く、最も長い 0 の連続を :: にする）。
 */
export function formatIp(bytes: Uint8Array): string {
  if (bytes.length === 4) return bytes.join(".");
  const words = Array.from({ length: 8 }, (_, i) => (bytes[i * 2] << 8) | bytes[i * 2 + 1]);
  // RFC 5952 4.2.2・4.2.3：0 が 1 つだけなら :: にしない。同じ長さの連続が複数あれば前を :: にする
  let zeros = { start: -1, length: 0 };
  for (let i = 0; i < 8;) {
    let end = i;
    while (end < 8 && words[end] === 0) end++;
    if (end - i >= 2 && end - i > zeros.length) zeros = { start: i, length: end - i };
    i = Math.max(end, i + 1);
  }
  const hex = words.map((w) => w.toString(16));
  if (zeros.start < 0) return hex.join(":");
  const head = hex.slice(0, zeros.start).join(":");
  const tail = hex.slice(zeros.start + zeros.length).join(":");
  return `${head}::${tail}`;
}

/** address は parseIp の戻り値。IPv4 と IPv6 は互いに含まない。 */
export function cidrContains(cidr: Cidr, address: Uint8Array): boolean {
  if (cidr.bytes.length !== address.length) return false;
  const full = Math.floor(cidr.prefix / 8);
  for (let i = 0; i < full; i++) {
    if (cidr.bytes[i] !== address[i]) return false;
  }
  const rest = cidr.prefix % 8;
  if (rest === 0) return true;
  const mask = (0xff << (8 - rest)) & 0xff;
  return (cidr.bytes[full] & mask) === (address[full] & mask);
}

function parseIpv4(text: string): Uint8Array | undefined {
  const parts = text.split(".");
  if (parts.length !== 4) return undefined;
  // 先頭の 0 は 8 進数と解釈する実装があり、同じ文字列が別のアドレスを指しうるため受け付けない
  if (!parts.every((p) => /^(?:0|[1-9]\d{0,2})$/.test(p) && Number(p) <= 255)) return undefined;
  return Uint8Array.from(parts, Number);
}

function parseIpv6(text: string): Uint8Array | undefined {
  const halves = text.split("::");
  if (halves.length > 2) return undefined;
  const words: number[][] = [];
  for (const [h, half] of halves.entries()) {
    const groups = half === "" ? [] : half.split(":");
    const out: number[] = [];
    for (const [g, group] of groups.entries()) {
      // 末尾の 2 グループは IPv4 の書き方でも書ける
      if (h === halves.length - 1 && g === groups.length - 1 && group.includes(".")) {
        const v4 = parseIpv4(group);
        if (!v4) return undefined;
        out.push((v4[0] << 8) | v4[1], (v4[2] << 8) | v4[3]);
      } else if (/^[0-9A-Fa-f]{1,4}$/.test(group)) {
        out.push(parseInt(group, 16));
      } else {
        return undefined;
      }
    }
    words.push(out);
  }
  const [head, tail = []] = words;
  const zeros = 8 - head.length - tail.length;
  if (halves.length === 1 ? zeros !== 0 : zeros < 1) return undefined;
  const all = [...head, ...Array<number>(zeros).fill(0), ...tail];
  return Uint8Array.from(all.flatMap((w) => [w >> 8, w & 0xff]));
}
