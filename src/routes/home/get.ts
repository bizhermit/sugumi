import { findAccount } from "../../lib/auth/accounts.ts";
import { csrfInput } from "../../web/csrf.ts";
import { escapeHtml } from "../../lib/html.ts";
import { htmlDocument } from "../../web/html-document.ts";
import type { RouteContext } from "../../web/router.ts";
import { path, redirect } from "../../web/url.ts";

export default async function (_req: Request, ctx: RouteContext): Promise<Response> {
  const account = ctx.session && findAccount(ctx.session.accountId);
  if (!account) return redirect(path("/login"));

  const html = await htmlDocument(ctx, {
    title: "ホーム",
    page: import.meta.url,
    slots: {
      main: `<h1>ホーム</h1>
<p>${escapeHtml(account.displayName)}としてログインしています。</p>
<form id="logout" method="post" action="${escapeHtml(path("/logout"))}">
${csrfInput(await ctx.csrfToken())}
<button>ログアウト</button>
</form>`,
    },
  });
  return new Response(html, {
    headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" },
  });
}
