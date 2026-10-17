import { audit } from "../../lib/audit.ts";
import { clearSessionCookie, destroySession } from "../../lib/auth/session.ts";
import type { PageContext } from "../../web/router.ts";
import { path, redirect } from "../../web/url.ts";

export default async function (_req: Request, ctx: PageContext): Promise<Response> {
  if (ctx.session) {
    await destroySession(ctx.session);
    audit("logged_out", { accountId: ctx.session.accountId, remoteAddress: ctx.remoteAddress });
  }
  const res = redirect(path("/login"), 303);
  res.headers.append("set-cookie", clearSessionCookie());
  return res;
}
