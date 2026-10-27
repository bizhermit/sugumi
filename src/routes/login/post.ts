import { authenticate } from "../../lib/auth/accounts.ts";
import { loginDeviceCookie, readLoginDevice } from "../../lib/auth/login-devices.ts";
import { createSession, destroySession, sessionCookie } from "../../lib/auth/session.ts";
import { audit } from "../../lib/audit.ts";
import { clearPreLoginCookie } from "../../web/csrf.tsx";
import { errorPage } from "../../web/error-page.tsx";
import type { RouteContext } from "../../web/router.ts";
import { appPathOf, path, redirect } from "../../web/url.ts";
import { loginForm } from "./view.tsx";

/**
 * ユーザー名とパスワードでログインし、セッションを作って to（なければ /home）へリダイレクトする。
 * 失敗したときは、理由を伏せたメッセージでフォームを出し直し、理由は監査ログに残す。
 */
export default async function (req: Request, ctx: RouteContext): Promise<Response> {
  const form = await ctx.form();
  const username = form.get("username");
  const password = form.get("password");
  if (typeof username !== "string" || typeof password !== "string") {
    return errorPage(400);
  }
  const toValue = form.get("to");
  const to = typeof toValue === "string" ? appPathOf(toValue) : undefined;

  const result = await authenticate(username, password, ctx.remoteAddress, readLoginDevice(req));
  if (result.status !== "ok") {
    const accountId = "account" in result ? result.account.id : undefined;
    // 巨大な値を送られてもログがあふれないよう、切り詰める。
    audit("login_failed", ctx, {
      reason: result.status,
      username: username.slice(0, 64),
      accountId,
      trustedDevice: "trustedDevice" in result ? result.trustedDevice : undefined,
    });
    if (result.status === "wrong_password" && result.locked) {
      audit("account_locked", ctx, { accountId });
    }
    if (result.status === "address_blocked" && result.blocks) {
      audit("address_blocked", ctx, { blockedAddress: result.blockedAddress });
    }
    // どの失敗かを画面で区別すると、アカウントの有無やロックの状態、接続元の制限が分かってしまう。
    return await loginForm(ctx, {
      status: 401,
      username,
      to,
      message: "ユーザー名またはパスワードが違うか、アカウントがロックされています。",
    });
  }
  // ログイン前と同じトークンを使い続けるとセッション固定攻撃を受けるので、ログインのたびに作り直す。
  if (ctx.session) {
    await destroySession(ctx.session);
  }
  const session = await createSession(result.account);
  audit("login_succeeded", ctx, {
    accountId: result.account.id,
    sessionLogId: session.logId,
    trustedDevice: result.trustedDevice,
  });
  const res = redirect(to ?? path("/home"), 303);
  res.headers.append("set-cookie", sessionCookie(session));
  if (result.deviceToken !== undefined) {
    res.headers.append("set-cookie", loginDeviceCookie(result.deviceToken));
  }
  res.headers.append("set-cookie", clearPreLoginCookie());
  return res;
}
