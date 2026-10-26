/**
 * アプリのログ（アクセスログ・エラーログ・警告・監査ログ）を、1 行の JSON で出す。
 * 標準出力（エラーと警告は標準エラー）に出すだけで、ファイルには書かない。
 * 本番では compose.yaml の log-forwarder が受け取り、サーバーの外（CloudWatch か社内のログ用のサーバー）へ送る。
 * アプリにログを書き換える・消す権限を持たせないため。
 * パスワード・トークン・セッション ID は渡さないこと。
 */

/** record を 1 行の JSON にして出す。toStderr なら標準エラーに出す。 */
export function writeLog(record: object, toStderr = false): void {
  const line = JSON.stringify(record);
  if (toStderr) console.error(line);
  else console.log(line);
}

/** 例外をエラーログに出す。リクエストの処理中なら requestId を渡す。 */
export function logError(e: unknown, requestId?: string): void {
  writeLog({
    type: "error",
    time: new Date().toISOString(),
    requestId,
    // スタックトレースの改行で行が分かれないよう、ほかのログと同じく 1 行の JSON にする
    error: e instanceof Error ? e.stack ?? String(e) : String(e),
  }, true);
}

/** 設定の不備など、エラーではないが運用者に知らせたいことを出す。 */
export function logWarning(message: string): void {
  writeLog({ type: "warning", time: new Date().toISOString(), message }, true);
}
