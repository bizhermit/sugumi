/** Set-Cookie の値から、Cookie ヘッダーに載せる `名前=値` を取り出す。 */
export function cookiePair(setCookie: string): string {
  return setCookie.split(";")[0];
}
