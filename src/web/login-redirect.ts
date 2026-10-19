import { path, redirect } from "./url.ts";

/**
 * ログインしていない利用者をログイン画面に送る。ログイン後は、リクエストされた URL に戻す。
 * GET・HEAD 以外では、戻ってもページを開けないため、戻り先を付けない。
 */
export function loginRedirect(req: Request): Response {
  const url = new URL(req.url);
  const to = req.method === "GET" || req.method === "HEAD" ? url.pathname + url.search : null;
  return redirect(path("/login", { query: { to } }));
}
