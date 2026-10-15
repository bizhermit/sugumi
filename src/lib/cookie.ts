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

export function readCookie(req: Request, name: string): string | undefined {
  for (const pair of (req.headers.get("cookie") ?? "").split(";")) {
    const [key, value] = pair.trim().split("=", 2);
    if (key === name && value !== undefined && value !== "") return value;
  }
  return undefined;
}
