import type { RouteContext } from "../../web/router.ts";
import { path, redirect } from "../../web/url.ts";
import { loginForm } from "./view.ts";

export default async function (req: Request, ctx: RouteContext): Promise<Response> {
  if (ctx.session) return redirect(path("/home"));
  const expired = new URL(req.url).searchParams.get("expired") === "1";
  return await loginForm(ctx, {
    message: expired ? "有効期限が切れました。もう一度ログインしてください。" : undefined,
  });
}
