import { appSlot } from "../../web/context.ts";
import { HttpError } from "../../web/http-error.ts";
import type { Middleware } from "../../web/routes.ts";
import { loginAccountSlot } from "./login-account.ts";
import { loginPathWithReturnTo } from "./return-to.ts";
import { findSession, sessionSlot } from "./session.ts";

const requireLogin: Middleware = async (req, next) => {
  const { db } = appSlot.get(req);
  const session = await findSession(db, req);
  if (session == null) {
    if (req.method === "GET" || req.method === "HEAD") {
      return new Response(null, { status: 303, headers: { Location: loginPathWithReturnTo(new URL(req.url)) } });
    }
    throw new HttpError(403, "ログインしてください。");
  }
  sessionSlot.set(req, session);
  loginAccountSlot.set(req, session.account);
  return await next();
};

export { requireLogin };
