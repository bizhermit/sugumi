import { loginRedirect } from "../web/login-redirect.ts";
import type { RouteContext } from "../web/router.ts";
import type { RoutePath } from "../routes.gen.ts";
import { loginAccount } from "./login-account.ts";

// ページを追加したときにログインの確認を書き忘れても公開されないよう、
// ログインを求めるルートではなく、ログインなしで開けるルートのほうを列挙する。
// /logout は、ログインしていなければ各メソッドのファイルがログイン画面へ送る。
// ここで送ると to=/logout が付き、ログインした直後にログアウトの確認画面が出てしまう
const PUBLIC_ROUTES: ReadonlySet<RoutePath> = new Set<RoutePath>([
  "/",
  "/healthz",
  "/login",
  "/logout",
]);

export default function (req: Request, ctx: RouteContext): Response | undefined {
  if (!PUBLIC_ROUTES.has(ctx.route)) {
    if (!ctx.session) return loginRedirect(req);
    loginAccount.set(ctx, ctx.session.account);
  }
  return undefined;
}
