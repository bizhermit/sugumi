/**
 * アプリのログ（アクセスログ・エラーログ・警告・監査ログ）を、1 行の JSON で出す。
 * 標準出力（エラーと警告は標準エラー）に出すだけで、ファイルには書かない。
 * 本番では compose.yaml の log-forwarder が受け取り、サーバーの外（CloudWatch かログ用サーバー）へ送る。
 * ファイルに書かないのは、アプリにログを書き換えたり消したりする権限を持たせないため。
 * パスワード・トークン・セッション ID は渡さないこと。
 */

// Docker は 16 KB を超える行を分割して渡すので、1 行に 1 つの JSON という形が崩れる。
// そのため、例外の内容は JSON にしたうえで、このバイト数までに切り詰める。
const MAX_ERROR_BYTES = 8 * 1024;

const encoder = new TextEncoder();

/** record を 1 行の JSON にして出す。toStderr なら標準エラーに出す。 */
export function writeLog(record: object, toStderr = false): void {
  const line = JSON.stringify(record);
  if (toStderr) {
    console.error(line);
  } else {
    console.log(line);
  }
}

/** 例外をエラーログに出す。リクエストの処理中なら requestId を渡す。 */
export function logError(e: unknown, requestId?: string): void {
  writeLog({
    type: "error",
    time: new Date().toISOString(),
    requestId,
    // スタックトレースの改行で行が分かれないよう、ほかのログと同じく 1 行の JSON にする。
    error: truncateError(errorText(e)),
  }, true);
}

/** 設定の不備など、エラーではないが運用者に知らせたいことを出す。 */
export function logWarning(message: string): void {
  writeLog({ type: "warning", time: new Date().toISOString(), message }, true);
}

function errorText(e: unknown) {
  return e instanceof Error ? e.stack ?? String(e) : String(e);
}

// 例外のときしか通らないので、速さより読みやすさを優先し、収まるまで少しずつ縮める。
function truncateError(text: string) {
  while (encoder.encode(JSON.stringify(text)).byteLength > MAX_ERROR_BYTES) {
    text = text.slice(0, Math.floor(text.length * 0.9));
  }
  return text;
}
