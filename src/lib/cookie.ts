/**
 * Set-Cookie ヘッダーの値を返す。name は `__Host-` で始める。
 * `__Host-` を付けると Secure と Path=/ が必須になり、Domain も付けられない。
 * そのため、サブドメインなどほかのオリジンから上書きされない。ブラウザは http://localhost でも Secure の Cookie を受け付ける。
 *
 * Strict にすると、外部サイトのリンクから来たときに Cookie が送られず、ログインしていない扱いになる。
 * そのため Lax にし、CSRF はトークンで防ぐ。
 */
export function hostCookie(name: `__Host-${string}`, value: string): string {
  return `${name}=${value}; Path=/; Secure; HttpOnly; SameSite=Lax`;
}

/** hostCookie() で発行した Cookie を消す Set-Cookie ヘッダーの値を返す。name は発行したときと同じものを渡す。 */
export function clearHostCookie(name: `__Host-${string}`): string {
  return `${hostCookie(name, "")}; Max-Age=0`;
}

/**
 * name の Cookie の値を返す。値が空なら、同じ name の次の Cookie を探す。name に `=` を含めないこと。
 * 値に `=` が含まれていれば、その手前までを返す。
 */
export function readCookie(req: Request, name: string): string | undefined {
  const header = req.headers.get("cookie");
  if (header === null) return undefined;
  // 1 回のリクエストで何度も呼ぶので、split() で配列を作らずに `;` を探す。
  let start = 0;
  while (start <= header.length) {
    let end = header.indexOf(";", start);
    if (end === -1) end = header.length;
    const pair = header.slice(start, end).trim();
    if (pair.startsWith(name) && pair.charCodeAt(name.length) === 0x3d) {
      const valueEnd = pair.indexOf("=", name.length + 1);
      const value = pair.slice(name.length + 1, valueEnd === -1 ? undefined : valueEnd);
      if (value !== "") return value;
    }
    start = end + 1;
  }
  return undefined;
}
