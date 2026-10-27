/**
 * プロセスがレスポンスを返せるかだけを返し、DB にはクエリを送らない。
 * DB が止まったときに、アプリまで異常と判定して再起動や切り離しをしても直らない。DB の監視は DB の側で行う。
 * セッションの確認でもクエリを送らないよう、src/web/app.ts の SESSIONLESS_ROUTES に入れている。
 * ログインなしで誰でも呼べるので、バージョンやエラーの詳細など、内部の情報は返さない。
 */
export default function (): Response {
  return new Response("ok", { headers: { "content-type": "text/plain; charset=utf-8" } });
}
