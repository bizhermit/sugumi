import { findAccount } from "../../lib/auth/accounts.ts";
import { csrfInput } from "../../web/csrf.ts";
import { escapeHtml } from "../../lib/html.ts";
import { layout } from "../../web/layout.ts";
import type { PageContext } from "../../web/router.ts";
import { path, redirect } from "../../web/url.ts";

export default async function (_req: Request, ctx: PageContext): Promise<Response> {
  const account = ctx.session && findAccount(ctx.session.accountId);
  if (!account) return redirect(path("/login"));

  const html = layout({
    title: "ホーム",
    page: import.meta.url,
    body: `<h1>ホーム</h1>
<p>${escapeHtml(account.displayName)}としてログインしています。</p>
<form id="logout" method="post" action="${escapeHtml(path("/logout"))}">
${csrfInput(await ctx.csrfToken())}
<button>ログアウト</button>
</form>`,
  });
  return new Response(html, {
    headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" },
  });
}
