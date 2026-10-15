/**
 * アプリ全体のリクエストハンドラ。
 * 今後はここでルーティングを行い、各モジュール（src/modules/*）へ処理を振り分ける。
 */
export function handler(_req: Request): Response {
  return new Response("hello world", {
    headers: { "content-type": "text/plain; charset=utf-8" },
  });
}
