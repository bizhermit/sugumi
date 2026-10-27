import { editHeaders } from "./response.ts";

/**
 * 外部のスクリプト・スタイル・iframe を使わない前提で、許可を最小にしている。
 * 制限を緩めたいページは、そのページのレスポンスに同じ名前のヘッダーを設定する。
 */

export type CspDirectives = Record<string, ReadonlyArray<string>>;

const DEFAULT_CSP: CspDirectives = {
  "default-src": ["'none'"],
  "script-src": ["'self'"],
  "style-src": ["'self'"],
  "img-src": ["'self'"],
  "font-src": ["'self'"],
  "connect-src": ["'self'"],
  "manifest-src": ["'self'"],
  "form-action": ["'self'"],
  "frame-ancestors": ["'none'"],
  "base-uri": ["'none'"],
  // innerHTML などに文字列を代入できなくして、DOM 経由の XSS を防ぐ。
  "require-trusted-types-for": ["'script'"],
  "trusted-types": ["'none'"],
};

/**
 * デフォルトの CSP のうち、overrides に渡したディレクティブだけを置き換えた値を返す。
 * 空の配列を渡したディレクティブは出力しない。
 *
 *   contentSecurityPolicy({ "img-src": ["'self'", "data:"] })
 */
export function contentSecurityPolicy(overrides: CspDirectives = {}): string {
  return Object.entries({ ...DEFAULT_CSP, ...overrides })
    .filter(([, sources]) => sources.length > 0)
    .map(([name, sources]) => [name, ...sources].join(" "))
    .join("; ");
}

const DEFAULT_HEADERS: Array<[string, string]> = [
  ["content-security-policy", contentSecurityPolicy()],
  ["x-content-type-options", "nosniff"],
  // ログイン後のページが共有 PC のブラウザやプロキシに残らないよう、デフォルトではキャッシュさせない。
  // キャッシュしてよいレスポンスは、自分で cache-control を設定する。
  ["cache-control", "no-store"],
  // HTTPS で配信する前提。ブラウザは HTTP で受け取った HSTS を無視するので、開発中の http://localhost には影響しない。
  ["strict-transport-security", "max-age=31536000; includeSubDomains"],
  // no-referrer にすると同一オリジンへの POST でも Origin が null になり、Origin による CSRF 対策ができない。
  ["referrer-policy", "same-origin"],
  // frame-ancestors を解釈しないブラウザ向け。
  ["x-frame-options", "DENY"],
  ["cross-origin-opener-policy", "same-origin"],
  ["cross-origin-embedder-policy", "require-corp"],
  ["cross-origin-resource-policy", "same-origin"],
  [
    "permissions-policy",
    [
      "accelerometer",
      "autoplay",
      "camera",
      "display-capture",
      "encrypted-media",
      "fullscreen",
      "geolocation",
      "gyroscope",
      "magnetometer",
      "microphone",
      "midi",
      "payment",
      "picture-in-picture",
      "screen-wake-lock",
      "serial",
      "usb",
      "xr-spatial-tracking",
    ].map((feature) => `${feature}=()`).join(", "),
  ],
];

/**
 * res にまだないセキュリティヘッダーを追加して返す。res のヘッダーは変更できなくてもよい。
 * res をその場で書き換えるので、ほかのレスポンスに使い回さないこと（response.ts を参照）。
 */
export function withSecurityHeaders(res: Response): Response {
  return editHeaders(res, setDefaults, undefined);
}

function setDefaults(headers: Headers) {
  for (const [name, value] of DEFAULT_HEADERS) {
    if (!headers.has(name)) {
      headers.set(name, value);
    }
  }
}
