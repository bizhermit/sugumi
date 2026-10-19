import type { RouteContext } from "../web/router.ts";
import { path, redirect } from "../web/url.ts";

export default function (_req: Request, ctx: RouteContext): Response {
  // /login はログイン中に開くとログアウトするため、ログイン中はホームに送る
  return redirect(path(ctx.session ? "/home" : "/login"));
}
