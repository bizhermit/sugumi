import { clearSessionCookie, logout } from "../../lib/auth/session.ts";
import type { RouteContext } from "../../web/router.ts";
import { appPathOf, path, redirect } from "../../web/url.ts";
import { loginForm } from "./view.tsx";

export default async function (_req: Request, ctx: RouteContext): Promise<Response> {
  const { query } = ctx;
  const to = appPathOf(query.get("to"));
  if (ctx.session) {
    // 別のアカウントでログインし直せるよう、開いただけでログアウトする。
    // 外部サイトのリンクやブラウザの先読みでもログアウトされるが、許容している
    await logout(ctx.session, ctx.remoteAddress);
    // CSRF トークンはセッションに結び付いているため、フォームはログイン前のトークンで出し直す
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
