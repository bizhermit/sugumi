/** URL や Cookie にそのまま使える、推測できない 256 ビットのランダム文字列を返す。 */
export function randomToken(): string {
  return crypto.getRandomValues(new Uint8Array(32)).toBase64({
    alphabet: "base64url",
    omitPadding: true,
  });
}

// randomToken() の形式。32 バイトを base64url でパディングなしにすると 43 文字になる
const RANDOM_TOKEN = /^[A-Za-z0-9_-]{43}$/;

/** randomToken() が返しうる形式なら true。利用者から受け取ったトークンを、DB などで照合する前に確かめる。 */
export function isRandomToken(value: string): boolean {
  return RANDOM_TOKEN.test(value);
}

const encoder = new TextEncoder();

/** 秘密の値の比較に使う。一致した文字数によって処理時間が変わらないようにしている。 */
export function timingSafeEqual(a: string, b: string): boolean {
  const x = encoder.encode(a);
  const y = encoder.encode(b);
  let diff = x.length ^ y.length;
  for (let i = 0; i < x.length; i++) diff |= x[i] ^ (y[i] ?? 0);
  return diff === 0;
}
