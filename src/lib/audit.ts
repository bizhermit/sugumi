/**
 * 監査ログを出す。出し方は src/lib/log.ts を参照。
 * パスワード・トークン・セッション ID は渡さないこと。
 */
import { writeLog } from "./log.ts";

export type AuditEvent =
  | "login_succeeded"
  | "login_failed"
  | "account_locked"
  | "address_blocked"
  | "logged_out";

/**
 * 監査ログの元になったリクエスト。ページの ctx（RouteContext）をそのまま渡せる。
 * requestId は、アクセスログ・エラーログと突き合わせるために出す。
 */
export type AuditSource = {
  readonly requestId: string;
  readonly remoteAddress: string | undefined;
};

/** audit() が付ける項目は、data で上書きできないようにしている。 */
export type AuditData =
  & Record<string, unknown>
  & {
    [K in "type" | "time" | "requestId" | "event" | "remoteAddress"]?: never;
  };

/**
 * 監査ログを 1 行出す。data には、event ごとに調べるときに要る値（ユーザー名など）を入れる。
 * 時刻・requestId・接続元は audit() が付ける。
 */
export function audit(
  event: AuditEvent,
  { requestId, remoteAddress }: AuditSource,
  data: AuditData = {},
): void {
  writeLog({
    type: "audit",
    time: new Date().toISOString(),
    requestId,
    event,
    remoteAddress,
    ...data,
  });
}
