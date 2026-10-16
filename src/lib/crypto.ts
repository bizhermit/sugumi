/** URL や Cookie にそのまま使える、推測できない 256 ビットのランダム文字列を返す。 */
export function randomToken(): string {
  return crypto.getRandomValues(new Uint8Array(32)).toBase64({
    alphabet: "base64url",
    omitPadding: true,
  });
}

/** 秘密の値の比較に使う。一致した文字数によって処理時間が変わらないようにしている。 */
export function timingSafeEqual(a: string, b: string): boolean {
  const x = new TextEncoder().encode(a);
  const y = new TextEncoder().encode(b);
  let diff = x.length ^ y.length;
  for (let i = 0; i < x.length; i++) diff |= x[i] ^ (y[i] ?? 0);
  return diff === 0;
}
