import { path, redirect } from "./url.ts";

/**
 * ログインしていないユーザーを、ログイン画面へリダイレクトするレスポンスを返す。
 * ログインしたあとは、いまリクエストされた URL に戻る。
 * GET・HEAD 以外のリクエストは、戻っても同じページを開けないので、戻り先を付けない。
 */
export function loginRedirect(req: Request): Response {
  const url = new URL(req.url);
  const to = req.method === "GET" || req.method === "HEAD" ? url.pathname + url.search : null;
  return redirect(path("/login", { query: { to } }));
}
