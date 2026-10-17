import type { PageContext } from "../../web/router.ts";
import { path, redirect } from "../../web/url.ts";
import { loginForm } from "./view.ts";

export default async function (req: Request, ctx: PageContext): Promise<Response> {
  if (ctx.session) return redirect(path("/home"));
  const expired = new URL(req.url).searchParams.get("expired") === "1";
  return loginForm(await ctx.csrfToken(), {
    message: expired ? "有効期限が切れました。もう一度ログインしてください。" : undefined,
  });
}
