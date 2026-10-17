import { authenticate } from "../../lib/auth/accounts.ts";
import { createSession, destroySession, sessionCookie } from "../../lib/auth/session.ts";
import { audit } from "../../lib/audit.ts";
import { clearPreLoginCookie } from "../../web/csrf.ts";
import { errorPage } from "../../web/error-page.ts";
import type { RouteContext } from "../../web/router.ts";
import { path, redirect } from "../../web/url.ts";
import { loginForm } from "./view.ts";

export default async function (req: Request, ctx: RouteContext): Promise<Response> {
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return errorPage(400);
  }
  const username = form.get("username");
  const password = form.get("password");
  if (typeof username !== "string" || typeof password !== "string") return errorPage(400);

  const result = await authenticate(username, password);
  const { remoteAddress } = ctx;
  if (result.status !== "ok") {
    const accountId = "account" in result ? result.account.id : undefined;
    // 巨大な値でログを埋められないよう切り詰める
    audit("login_failed", {
      reason: result.status,
      username: username.slice(0, 64),
      accountId,
      remoteAddress,
    });
    if (result.status === "wrong_password" && result.locked) {
      audit("account_locked", { accountId, remoteAddress });
    }
    // どの失敗かを区別して見せると、アカウントの有無やロックの状態が分かってしまう
    return loginForm(await ctx.csrfToken(), {
      status: 401,
      username,
      message: "ユーザー名またはパスワードが違うか、アカウントがロックされています。",
    });
  }
  // ログイン前と同じトークンを使い続けるとセッション固定攻撃を受けるため、ログインのたびに作り直す
  if (ctx.session) await destroySession(ctx.session);
  audit("login_succeeded", { accountId: result.account.id, remoteAddress });
  const res = redirect(path("/home"), 303);
  res.headers.append("set-cookie", sessionCookie(await createSession(result.account.id)));
  res.headers.append("set-cookie", clearPreLoginCookie());
  return res;
}
