import { authenticate } from "../../lib/auth/accounts.ts";
import { loginDeviceCookie, readLoginDevice } from "../../lib/auth/login-devices.ts";
import { createSession, destroySession, sessionCookie } from "../../lib/auth/session.ts";
import { audit } from "../../lib/audit.ts";
import { clearPreLoginCookie } from "../../web/csrf.tsx";
import { errorPage } from "../../web/error-page.tsx";
import type { RouteContext } from "../../web/router.ts";
import { appPathOf, path, redirect } from "../../web/url.ts";
import { loginForm } from "./view.tsx";

export default async function (req: Request, ctx: RouteContext): Promise<Response> {
  const form = await ctx.form();
  const username = form.get("username");
  const password = form.get("password");
  if (typeof username !== "string" || typeof password !== "string") return errorPage(400);
  const toValue = form.get("to");
  const to = typeof toValue === "string" ? appPathOf(toValue) : undefined;

  const { remoteAddress } = ctx;
  const result = await authenticate(username, password, remoteAddress, readLoginDevice(req));
  if (result.status !== "ok") {
    const accountId = "account" in result ? result.account.id : undefined;
    // 巨大な値でログを埋められないよう切り詰める
    audit("login_failed", {
      reason: result.status,
      username: username.slice(0, 64),
      accountId,
      trustedDevice: "trustedDevice" in result ? result.trustedDevice : undefined,
      remoteAddress,
    });
    if (result.status === "wrong_password" && result.locked) {
      audit("account_locked", { accountId, remoteAddress });
    }
    if (result.status === "address_blocked" && result.blocks) {
      audit("address_blocked", { blockedAddress: result.blockedAddress, remoteAddress });
    }
    // どの失敗かを区別して見せると、アカウントの有無やロックの状態、接続元の制限が分かってしまう
    return await loginForm(ctx, {
      status: 401,
      username,
      to,
      message: "ユーザー名またはパスワードが違うか、アカウントがロックされています。",
    });
  }
  // ログイン前と同じトークンを使い続けるとセッション固定攻撃を受けるため、ログインのたびに作り直す
  if (ctx.session) await destroySession(ctx.session);
  audit("login_succeeded", {
    accountId: result.account.id,
    trustedDevice: result.trustedDevice,
    remoteAddress,
  });
  const res = redirect(to ?? path("/home"), 303);
  res.headers.append("set-cookie", sessionCookie(await createSession(result.account)));
  if (result.deviceToken !== undefined) {
    res.headers.append("set-cookie", loginDeviceCookie(result.deviceToken));
  }
  res.headers.append("set-cookie", clearPreLoginCookie());
  return res;
}
