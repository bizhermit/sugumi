// プロセスが応答できるかだけを返し、DB には問い合わせない。
// DB が止まったときにアプリまで異常として再起動や切り離しをしても直らず、DB の監視は DB のほうで行うため。
// セッションの確認でも問い合わせないよう、src/web/app.ts の SESSIONLESS_ROUTES に入れている。
// ログインなしで誰でも呼べるため、バージョンやエラーの詳細など内部の情報は返さない
export default function (): Response {
  return new Response("ok", { headers: { "content-type": "text/plain; charset=utf-8" } });
}
