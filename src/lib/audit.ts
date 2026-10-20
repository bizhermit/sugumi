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

export function audit(event: AuditEvent, data: Record<string, unknown>): void {
  console.log(JSON.stringify({ type: "audit", time: new Date().toISOString(), event, ...data }));
}
