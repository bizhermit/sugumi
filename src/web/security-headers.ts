/**
 * 全レスポンスに付けるセキュリティヘッダ
 * 外部のスクリプト・スタイル・iframe を使用しない前提で、許可を最小にしている。
 * 緩めたい画面は、そのレスポンスに同じ名前のヘッダを付ける。ここでは同名のヘッダがあれば触らない。
 */

export type CspDirectives = Readonly<Record<string, readonly string[]>>;

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
  // innerHTML などへの文字列の代入を禁止して、DOM経由のXSSを防ぐ。
  "require-trusted-types-for": ["'script'"],
  "trusted-types": ["'none'"],
};

export function contentSecurityPolicy(overrides: CspDirectives = {}): string {
  return Object.entries({ ...DEFAULT_CSP, ...overrides })
    .filter(([, sources]) => sources.length > 0)
    .map(([name, sources]) => [name, ...sources].join(" "))
    .join("; ");
}

const PERMISSIONS = [
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
];

export const SECURITY_HEADERS: Readonly<Record<string, string>> = {
  "content-security-policy": contentSecurityPolicy(),
  // Content-Typeを無視した推測をさせない。
  "x-content-type-options": "nosniff",
  // ログイン後の画面が共有PCのブラウザやプロキシに残らないよう、デフォルトではキャッシュさせない。
  // キャッシュしてよいレスポンス（アセットなど）は自分でcache-controlを付ける。
  "cache-control": "no-store",
  // HTTPSで配信する前提。ブラウザはHTTPで受け取ったHSTSを無視するので、開発中の"http://localhost"には影響しない。
  "strict-transport-security": "max-age=31536000; includeSubDomains",
  // "no-referrer"にすると同一オリジンへのPOSTでもOriginがnullになり、OriginによるCSRF対策ができない。
  "referrer-policy": "same-origin",
  // frame-ancestorsを解釈しない古いブラウザ向け。
  "x-frame-options": "DENY",
  // 他オリジンのウィンドウやリソースから切り離す。
  "cross-origin-opener-policy": "same-origin",
  "cross-origin-embedder-policy": "require-corp",
  "cross-origin-resource-policy": "same-origin",
  // ブラウザの機能をすべて使わせない。使う画面は自分で付け直す。
  "permissions-policy": PERMISSIONS.map((feature) => `${feature}=()`).join(", "),
};

export function applySecurityHeaders(headers: Headers): void {
  for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
    if (!headers.has(name)) {
      headers.set(name, value);
    }
  }
}
