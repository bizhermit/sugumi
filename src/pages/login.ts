import { authenticate } from "../accounts.ts";
import { audit } from "../audit.ts";
import { clearPreLoginCookie, csrfInput } from "../csrf.ts";
import { errorPage, methodNotAllowed } from "../error-page.ts";
import { escapeHtml } from "../html.ts";
import type { PageContext } from "../router.ts";
import { createSession, destroySession, sessionCookie } from "../session.ts";
import { path, redirect } from "../url.ts";

export default async function (req: Request, ctx: PageContext): Promise<Response> {
  if (req.method === "POST") return await login(req, ctx);
  if (req.method !== "GET" && req.method !== "HEAD") {
    return methodNotAllowed(["GET", "HEAD", "POST"]);
  }
  if (ctx.session) return redirect(path("/home"));
  const expired = new URL(req.url).searchParams.get("expired") === "1";
  return loginForm(await ctx.csrfToken(), {
    message: expired ? "有効期限が切れました。もう一度ログインしてください。" : undefined,
  });
}

async function login(req: Request, ctx: PageContext): Promise<Response> {
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

type FormState = { status?: number; username?: string; message?: string };

function loginForm(
  csrfToken: string,
  { status = 200, username = "", message }: FormState,
): Response {
  const html = `<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>ログイン</title>
</head>
<body>
<h1>ログイン</h1>
${message ? `<p role="alert">${escapeHtml(message)}</p>\n` : ""}<form method="post" action="${
    escapeHtml(path("/login"))
  }">
${csrfInput(csrfToken)}
<p><label>ユーザー名 <input name="username" autocomplete="username" required value="${
    escapeHtml(username)
  }"></label></p>
<p><label>パスワード <input type="password" name="password" autocomplete="current-password" required></label></p>
<p><button>ログイン</button></p>
</form>
</body>
</html>
`;
  return new Response(html, {
    status,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}
