import { audit } from "../../lib/audit.ts";
import { csrfInput } from "../../web/csrf.ts";
import { methodNotAllowed } from "../../web/error-page.ts";
import { escapeHtml } from "../../lib/html.ts";
import { layout } from "../../web/layout.ts";
import type { PageContext } from "../../web/router.ts";
import { clearSessionCookie, destroySession } from "../../lib/auth/session.ts";
import { path, redirect } from "../../web/url.ts";

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
  const html = layout({
    title: "ログアウト",
    body: `<h1>ログアウト</h1>
<p>ログアウトしますか？</p>
<form method="post" action="${escapeHtml(path("/logout"))}">
${csrfInput(await ctx.csrfToken())}
<button>ログアウト</button>
</form>
<p><a href="${escapeHtml(path("/home"))}">ホームに戻る</a></p>`,
  });
  return new Response(html, {
    headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" },
  });
}
