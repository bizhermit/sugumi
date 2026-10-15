import { audit } from "../audit.ts";
import { methodNotAllowed } from "../error-page.ts";
import type { PageContext } from "../router.ts";
import { clearSessionCookie, destroySession } from "../session.ts";
import { path, redirect } from "../url.ts";

export default async function (req: Request, ctx: PageContext): Promise<Response> {
  if (req.method !== "POST") return methodNotAllowed(["POST"]);
  if (ctx.session) {
    await destroySession(ctx.session);
    audit("logged_out", { accountId: ctx.session.accountId, remoteAddress: ctx.remoteAddress });
  }
  const res = redirect(path("/login"), 303);
  res.headers.append("set-cookie", clearSessionCookie());
  return res;
}
