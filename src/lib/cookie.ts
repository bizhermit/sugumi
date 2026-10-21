/**
 * `__Host-` で始まる名前にすること。`__Host-` を付けると Secure・Path=/ が必須になり Domain も付けられないため、
 * サブドメインなど他のオリジンから上書きされない。ブラウザは http://localhost でも Secure の Cookie を受け付ける。
 *
 * Strict にすると外部サイトのリンクから来たときに Cookie が送られず、ログインしていない扱いになるため Lax にしている。
 * CSRF はトークンで防ぐ。
 */
export function hostCookie(name: `__Host-${string}`, value: string): string {
  return `${name}=${value}; Path=/; Secure; HttpOnly; SameSite=Lax`;
}

export function clearHostCookie(name: `__Host-${string}`): string {
  return `${hostCookie(name, "")}; Max-Age=0`;
}

/**
 * name の Cookie の値を返す。値が空なら、同じ name の次のものを探す。name に `=` を含めないこと。
 * 値は 2 つ目の `=` の手前まで。
 */
export function readCookie(req: Request, name: string): string | undefined {
  const header = req.headers.get("cookie");
  if (header === null) return undefined;
  // 1 リクエストで何度も呼ぶため、split() で配列を作らずに区切りを探す
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
