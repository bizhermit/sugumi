export const RETURN_TO_PARAM_NAME = "to";

export const DEFAULT_RETURN_PATH = "/home";

export function loginPathWithReturnTo(url: URL): string {
  const returnPath = url.pathname + url.search;
  if (returnPath === DEFAULT_RETURN_PATH) {
    return "/login";
  }
  const params = new URLSearchParams({ [RETURN_TO_PARAM_NAME]: returnPath });
  return `/login?${params.toString()}`;
}

export function toReturnPath(value: string | null | undefined): string | undefined {
  if (value == null || !value.startsWith("/")) {
    return undefined;
  }
  const url = new URL(value, "http://localhost");
  if (url.origin !== "http://localhost") {
    return undefined;
  }
  // `..`の除去で`/..//evil.example`が`//evil.example`（スキーム相対URL）になるので、正規化後の値で確かめる。
  if (url.pathname.startsWith("//") || url.pathname.startsWith("/\\")) {
    return undefined;
  }
  return url.pathname + url.search;
}
