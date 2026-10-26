/**
 * 監査ログ。ログの仕組みを用意したら、この関数の中身だけを差し替える。
 * パスワード・トークン・セッション ID は渡さないこと。
 */
export type AuditEvent =
  | "login_succeeded"
  | "login_failed"
  | "account_locked"
  | "address_blocked"
  | "logged_out";

/**
 * 監査ログを出すリクエスト。ページの ctx（RouteContext）をそのまま渡せる。
 * requestId は、アクセスログ・エラーログと突き合わせるために出す。
 */
export type AuditSource = {
  readonly requestId: string;
  readonly remoteAddress: string | undefined;
};

export function audit(
  event: AuditEvent,
  { requestId, remoteAddress }: AuditSource,
  data: Record<string, unknown> = {},
): void {
  console.log(
    JSON.stringify({
      type: "audit",
      time: new Date().toISOString(),
      requestId,
      event,
      remoteAddress,
      ...data,
    }),
  );
}
