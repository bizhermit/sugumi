import { findAccount } from "../../lib/auth/accounts.ts";
import { CsrfInput } from "../../web/csrf.tsx";
import { htmlDocument } from "../../web/html-document.tsx";
import { loginRedirect } from "../../web/login-redirect.ts";
import type { RouteContext } from "../../web/router.ts";
import { path } from "../../web/url.ts";

export default async function (req: Request, ctx: RouteContext): Promise<Response> {
  const account = ctx.session && findAccount(ctx.session.accountId);
  if (!account) return loginRedirect(req);

  const html = await htmlDocument(ctx, {
    title: "ホーム",
    page: import.meta.url,
    slots: {
      main: (
        <>
          <h1>ホーム</h1>
          <p>{account.displayName}としてログインしています。</p>
          <form id="logout" method="post" action={path("/logout")}>
            <CsrfInput token={await ctx.csrfToken()} />
            <button type="submit">ログアウト</button>
          </form>
        </>
      ),
    },
  });
  return new Response(html, {
    headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" },
  });
}
