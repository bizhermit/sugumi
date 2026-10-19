import { CsrfInput } from "../../web/csrf.tsx";
import { htmlDocument } from "../../web/html-document.tsx";
import type { RouteContext } from "../../web/router.ts";
import { path } from "../../web/url.ts";
import { loginAccount } from "../login-account.ts";

export default async function (_req: Request, ctx: RouteContext): Promise<Response> {
  const account = loginAccount.get(ctx);
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
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}
