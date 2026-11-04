import { appSlot } from "../../web/context.ts";
import type { Middleware } from "../../web/routes.ts";
import { loginAccountSlot } from "./login-account.ts";

const requireLogin: Middleware = async (req, next) => {
  const { logger } = appSlot.get(req);
  // TODO: 暫定処理。セッション実装時に認証確認する。
  logger.debug("login auth middleware");
  loginAccountSlot.set(req, { id: "1", name: "Slotテストユーザー" });
  return await next();
};

export { requireLogin };
