const PREFIX = "__Host-";

export type CookieOptions = {
  readonly maxAge?: number;
  readonly sameSite?: "Lax" | "Strict";
};

export function readCookie(req: Request, name: string): string | undefined {
  const header = req.headers.get("cookie");
  if (header == null) return undefined;
  const key = PREFIX + name;
  for (const pair of header.split(";")) {
    const index = pair.indexOf("=");
    if (index < 0) continue;
    if (pair.slice(0, index).trim() === key) {
      return pair.slice(index + 1).trim();
    }
  }
  return undefined;
}

export function hostCookie(name: string, value: string, options: CookieOptions = {}): string {
  let cookie = `${PREFIX}${name}=${value}; Path=/; Secure; HttpOnly; SameSite=${options.sameSite ?? "Lax"}`;
  if (options.maxAge != null) {
    cookie += `; Max-Age=${options.maxAge}`;
  }
  return cookie;
}

export function clearHostCookie(name: string): string {
  return hostCookie(name, "", { maxAge: 0 });
}
