import { clearSessionCookie, logout } from "../../lib/auth/session.ts";
import type { RouteContext } from "../../web/router.ts";
import { appPathOf, path, redirect } from "../../web/url.ts";
import { loginForm } from "./view.tsx";

/**
 * ログインのフォームを出す。ログイン中に開くと、ログアウトしてから /login へリダイレクトし直す。
 * クエリ文字列の to はログイン後の戻り先。expired=1 は、期限切れのセッションや CSRF トークンで送信して
 * 戻されたことを表し、そのことをメッセージで伝える。
 */
export default async function (_req: Request, ctx: RouteContext): Promise<Response> {
  const { query } = ctx;
  const to = appPathOf(query.get("to"));
  if (ctx.session) {
    // 別のアカウントでログインし直せるよう、開いただけでログアウトする。
    // 外部サイトのリンクやブラウザの先読みでもログアウトしてしまうが、それは許容している。
    await logout(ctx.session, ctx);
    // CSRF トークンはセッションに紐付いているので、ログイン前のトークンでフォームを出し直す。
    const res = redirect(path("/login", { query: { to } }));
    res.headers.append("set-cookie", clearSessionCookie());
    return res;
  }
  const expired = query.get("expired") === "1";
  return await loginForm(ctx, {
    to,
    message: expired ? "有効期限が切れました。もう一度ログインしてください。" : undefined,
  });
}
