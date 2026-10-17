import { csrfInput } from "../../web/csrf.ts";
import { escapeHtml } from "../../lib/html.ts";
import { htmlDocument } from "../../web/html-document.ts";
import type { RouteContext } from "../../web/router.ts";
import { path, redirect } from "../../web/url.ts";

export default async function (_req: Request, ctx: RouteContext): Promise<Response> {
  if (!ctx.session) return redirect(path("/login"));
  // 外部サイトのリンクや、ブラウザの先読み・リンクを確認するツールが GET するだけで
  // ログアウトさせられないよう、GET では確認画面を出し、そこからの POST でだけログアウトする
  return await confirmPage(ctx);
}

async function confirmPage(ctx: RouteContext): Promise<Response> {
  const html = await htmlDocument(ctx, {
    title: "ログアウト",
    page: import.meta.url,
    slots: {
      main: `<h1>ログアウト</h1>
<p>ログアウトしますか？</p>
<form method="post" action="${escapeHtml(path("/logout"))}">
${csrfInput(await ctx.csrfToken())}
<button>ログアウト</button>
</form>
<p><a href="${escapeHtml(path("/home"))}">ホームに戻る</a></p>`,
    },
  });
  return new Response(html, {
    headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" },
  });
}
