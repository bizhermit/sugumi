import { csrfInput } from "../../web/csrf.ts";
import type { RouteContext } from "../../web/router.ts";
import { escapeHtml } from "../../lib/html.ts";
import { htmlDocument } from "../../web/html-document.ts";
import { path } from "../../web/url.ts";

type FormState = { status?: number; username?: string; message?: string };

export async function loginForm(
  ctx: RouteContext,
  { status = 200, username = "", message }: FormState,
): Promise<Response> {
  // パスワード欄の spellcheck などは、_assets/index.ts で表示に切り替えたときに
  // 入力がスペルチェックや予測変換に渡らないようにするため
  const html = await htmlDocument(ctx, {
    title: "ログイン",
    page: import.meta.url,
    slots: {
      main: `<h1>ログイン</h1>
${message ? `<p role="alert">${escapeHtml(message)}</p>\n` : ""}<form method="post" action="${
        escapeHtml(path("/login"))
      }">
${csrfInput(await ctx.csrfToken())}
<p><label>ユーザー名 <input name="username" autocomplete="username" required value="${
        escapeHtml(username)
      }"></label></p>
<p><label>パスワード <input type="password" name="password" autocomplete="current-password" required spellcheck="false" autocapitalize="off" autocorrect="off"></label></p>
<p><button>ログイン</button></p>
</form>`,
    },
  });
  return new Response(html, {
    status,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}
