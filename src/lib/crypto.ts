/** URL や Cookie にそのまま使える、推測できない 256 ビットのランダム文字列を返す。 */
export function randomToken(): string {
  return crypto.getRandomValues(new Uint8Array(32)).toBase64({
    alphabet: "base64url",
    omitPadding: true,
  });
}

// randomToken() の形式。32 バイトを base64url でパディングなしにすると 43 文字になる。
const RANDOM_TOKEN = /^[A-Za-z0-9_-]{43}$/;

/** randomToken() が返す形式なら true を返す。ユーザーから受け取ったトークンを、DB で探す前に確かめるのに使う。 */
export function isRandomToken(value: string): boolean {
  return RANDOM_TOKEN.test(value);
}

const encoder = new TextEncoder();

/**
 * Cookie に入れるトークンを、DB に保存する形に変換する。DB やバックアップが漏れても、保存した値ではログインできない。
 * randomToken() の値は 256 ビットのランダムな値なので、ソルトや遅いハッシュは要らない。
 */
export async function hashToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(token));
  return new Uint8Array(digest).toBase64({ alphabet: "base64url", omitPadding: true });
}

/** 秘密の値を比べるのに使う。一致した文字数で処理時間が変わらないので、時間から値を推測されない。 */
export function timingSafeEqual(a: string, b: string): boolean {
  const x = encoder.encode(a);
  const y = encoder.encode(b);
  let diff = x.length ^ y.length;
  for (let i = 0; i < x.length; i++) diff |= x[i] ^ (y[i] ?? 0);
  return diff === 0;
}
