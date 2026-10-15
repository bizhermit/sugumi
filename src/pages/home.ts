import { findAccount } from "../lib/auth/accounts.ts";
import { csrfInput } from "../web/csrf.ts";
import { methodNotAllowed } from "../web/error-page.ts";
import { escapeHtml } from "../lib/html.ts";
import type { PageContext } from "../web/router.ts";
import { path, redirect } from "../web/url.ts";

export default async function (req: Request, ctx: PageContext): Promise<Response> {
  if (req.method !== "GET" && req.method !== "HEAD") return methodNotAllowed(["GET", "HEAD"]);
  const account = ctx.session && findAccount(ctx.session.accountId);
  if (!account) return redirect(path("/login"));

  const html = `<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>ホーム</title>
</head>
<body>
<h1>ホーム</h1>
<p>${escapeHtml(account.displayName)}としてログインしています。</p>
<form method="post" action="${escapeHtml(path("/logout"))}">
${csrfInput(await ctx.csrfToken())}
<button>ログアウト</button>
</form>
</body>
</html>
`;
  return new Response(html, {
    headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" },
  });
}
