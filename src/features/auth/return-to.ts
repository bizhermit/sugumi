export function toReturnPath(value: string | null | undefined): string | undefined {
  if (value == null || !value.startsWith("/")) {
    return undefined;
  }
  const url = new URL(value, "http://localhost");
  if (url.origin !== "http://localhost") {
    return undefined;
  }
  // `..`の除去で`/..//evil.example`が`//evil.example`（スキーム相対URL）になるため、正規化後の値で確かめる。
  if (url.pathname.startsWith("//") || url.pathname.startsWith("/\\")) {
    return undefined;
  }
  return url.pathname + url.search;
}
