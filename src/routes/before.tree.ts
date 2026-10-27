import { loginRedirect } from "../web/login-redirect.ts";
import type { RouteContext } from "../web/router.ts";
import type { RoutePath } from "../routes.gen.ts";
import { loginAccount } from "./login-account.ts";

// ページを追加したときにログインの確認を書き忘れても公開されないよう、
// ログインを求めるルートではなく、ログインなしで開けるルートのほうを並べる。
// /logout は、ログインしていなければ各メソッドのファイルがログイン画面へリダイレクトする。
// ここでリダイレクトすると to=/logout が付き、ログインした直後にログアウトの確認画面が出てしまう。
const PUBLIC_ROUTES: ReadonlySet<RoutePath> = new Set<RoutePath>([
  "/",
  "/healthz",
  "/login",
  "/logout",
]);

/**
 * PUBLIC_ROUTES 以外のルートで、ログインしていなければログイン画面へリダイレクトする。
 * ログイン中なら、loginAccount にアカウントを設定してページに進む。
 */
export default function (req: Request, ctx: RouteContext): Response | undefined {
  if (!PUBLIC_ROUTES.has(ctx.route)) {
    if (!ctx.session) return loginRedirect(req);
    loginAccount.set(ctx, ctx.session.account);
  }
  return undefined;
}
