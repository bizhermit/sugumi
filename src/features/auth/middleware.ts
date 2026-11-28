import { appSlot } from "../../web/context.ts";
import { HttpError } from "../../web/http-error.ts";
import type { Middleware } from "../../web/routes.ts";
import { loginAccountSlot } from "./login-account.ts";
import { loginPathWithReturnTo } from "./_shared/login.ts";
import { findSession, sessionSlot } from "./session.ts";
import { i18nSlot } from "../../web/i18n.ts";

const requireLogin: Middleware = async (req, next) => {
  const { db, session: limits } = appSlot.get(req);
  const session = await findSession(db, limits, req);
  if (session == null) {
    if (req.method === "GET" || req.method === "HEAD") {
      return new Response(null, { status: 303, headers: { Location: loginPathWithReturnTo(new URL(req.url)) } });
    }
    const { t } = i18nSlot.get(req);
    throw new HttpError(403, t("auth.login.required"));
  }
  sessionSlot.set(req, session);
  loginAccountSlot.set(req, session.account);
  return await next();
};

export { requireLogin };
