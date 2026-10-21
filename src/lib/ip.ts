// parseIp・formatIp・cidrContains はリクエストのたびに呼ぶため、コールバックや中間の配列を作らずにループで書いている

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
  return bytes && isIpv4Mapped(bytes) ? bytes.slice(12) : bytes;
}

function isIpv4Mapped(bytes: Uint8Array): boolean {
  for (let i = 0; i < 10; i++) {
    if (bytes[i] !== 0) return false;
  }
  return bytes[10] === 0xff && bytes[11] === 0xff;
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
  if (bytes.length === 4) return `${bytes[0]}.${bytes[1]}.${bytes[2]}.${bytes[3]}`;
  // RFC 5952 4.2.2・4.2.3：0 が 1 つだけなら :: にしない。同じ長さの連続が複数あれば前を :: にする
  let zerosStart = -1;
  let zerosLength = 0;
  for (let i = 0; i < 8;) {
    let end = i;
    while (end < 8 && wordAt(bytes, end) === 0) end++;
    if (end - i >= 2 && end - i > zerosLength) {
      zerosStart = i;
      zerosLength = end - i;
    }
    i = Math.max(end, i + 1);
  }
  let text = "";
  for (let i = 0; i < 8; i++) {
    if (i === zerosStart) {
      text += "::";
      i += zerosLength - 1;
      continue;
    }
    // :: の直後と先頭には : を付けない
    if (i > 0 && i !== zerosStart + zerosLength) text += ":";
    text += wordAt(bytes, i).toString(16);
  }
  return text;
}

function wordAt(bytes: Uint8Array, i: number): number {
  return (bytes[i * 2] << 8) | bytes[i * 2 + 1];
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
  const bytes = new Uint8Array(4);
  for (let i = 0; i < 4; i++) {
    // 先頭の 0 は 8 進数と解釈する実装があり、同じ文字列が別のアドレスを指しうるため受け付けない
    if (!IPV4_PART.test(parts[i])) return undefined;
    const value = Number(parts[i]);
    if (value > 255) return undefined;
    bytes[i] = value;
  }
  return bytes;
}

const IPV4_PART = /^(?:0|[1-9]\d{0,2})$/;
const IPV6_GROUP = /^[0-9A-Fa-f]{1,4}$/;

function parseIpv6(text: string): Uint8Array | undefined {
  const halves = text.split("::");
  if (halves.length > 2) return undefined;
  // 末尾の 2 グループは IPv4 の書き方でも書ける
  const head = parseGroups(halves[0], halves.length === 1);
  const tail = halves.length === 1 ? [] : parseGroups(halves[1], true);
  if (!head || !tail) return undefined;
  const zeros = 8 - head.length - tail.length;
  if (halves.length === 1 ? zeros !== 0 : zeros < 1) return undefined;
  // 省略した 0 のグループは、Uint8Array の初期値の 0 のままにする
  const bytes = new Uint8Array(16);
  for (let i = 0; i < head.length; i++) setWord(bytes, i, head[i]);
  for (let i = 0; i < tail.length; i++) setWord(bytes, 8 - tail.length + i, tail[i]);
  return bytes;
}

/** `:` で区切ったグループを 16 ビットの値の配列にする。v4Last なら、最後のグループを IPv4 の書き方でも受け付ける。 */
function parseGroups(half: string, v4Last: boolean): number[] | undefined {
  const words: number[] = [];
  if (half === "") return words;
  const groups = half.split(":");
  for (let g = 0; g < groups.length; g++) {
    const group = groups[g];
    if (v4Last && g === groups.length - 1 && group.includes(".")) {
      const v4 = parseIpv4(group);
      if (!v4) return undefined;
      words.push((v4[0] << 8) | v4[1], (v4[2] << 8) | v4[3]);
    } else if (IPV6_GROUP.test(group)) {
      words.push(parseInt(group, 16));
    } else {
      return undefined;
    }
  }
  return words;
}

function setWord(bytes: Uint8Array, i: number, word: number): void {
  bytes[i * 2] = word >> 8;
  bytes[i * 2 + 1] = word & 0xff;
}
