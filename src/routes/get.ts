import type { RouteContext } from "../web/router.ts";
import { path, redirect } from "../web/url.ts";

/** ログイン中ならホームへ、そうでなければログイン画面へリダイレクトする。 */
export default function (_req: Request, ctx: RouteContext): Response {
  // /login はログイン中に開くとログアウトするので、ログイン中はホームへリダイレクトする。
  return redirect(path(ctx.session ? "/home" : "/login"));
}
