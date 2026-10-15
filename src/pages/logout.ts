import { audit } from "../audit.ts";
import { csrfInput } from "../csrf.ts";
import { methodNotAllowed } from "../error-page.ts";
import { escapeHtml } from "../html.ts";
import type { PageContext } from "../router.ts";
import { clearSessionCookie, destroySession } from "../session.ts";
import { path, redirect } from "../url.ts";

export default async function (req: Request, ctx: PageContext): Promise<Response> {
  if (req.method === "POST") return await logout(ctx);
  if (req.method !== "GET" && req.method !== "HEAD") {
    return methodNotAllowed(["GET", "HEAD", "POST"]);
  }
  if (!ctx.session) return redirect(path("/login"));
  // 外部サイトのリンクや、ブラウザの先読み・リンクを確認するツールが GET するだけで
  // ログアウトさせられないよう、GET では確認画面を出し、そこからの POST でだけログアウトする
  return await confirmPage(ctx);
}

async function logout(ctx: PageContext): Promise<Response> {
  if (ctx.session) {
    await destroySession(ctx.session);
    audit("logged_out", { accountId: ctx.session.accountId, remoteAddress: ctx.remoteAddress });
  }
  const res = redirect(path("/login"), 303);
  res.headers.append("set-cookie", clearSessionCookie());
  return res;
}

async function confirmPage(ctx: PageContext): Promise<Response> {
  const html = `<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>ログアウト</title>
</head>
<body>
<h1>ログアウト</h1>
<p>ログアウトしますか？</p>
<form method="post" action="${escapeHtml(path("/logout"))}">
${csrfInput(await ctx.csrfToken())}
<button>ログアウト</button>
</form>
<p><a href="${escapeHtml(path("/home"))}">ホームに戻る</a></p>
</body>
</html>
`;
  return new Response(html, {
    headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" },
  });
}
