import { clearSessionCookie, logout } from "../../lib/auth/session.ts";
import type { RouteContext } from "../../web/router.ts";
import { path, redirect } from "../../web/url.ts";

export default async function (_req: Request, ctx: RouteContext): Promise<Response> {
  if (ctx.session) await logout(ctx.session, ctx.remoteAddress);
  const res = redirect(path("/login"), 303);
  res.headers.append("set-cookie", clearSessionCookie());
  return res;
}
