import { CsrfInput } from "../../web/csrf.tsx";
import type { RouteContext } from "../../web/router.ts";
import { htmlDocument } from "../../web/html-document.tsx";
import { type AppPath, path } from "../../web/url.ts";

/** to は、ログイン後の戻り先。appPathOf() で確かめた値を渡す。 */
type FormState = { status?: number; username?: string; message?: string; to?: AppPath };

export async function loginForm(
  ctx: RouteContext,
  { status = 200, username = "", message, to }: FormState,
): Promise<Response> {
  // パスワード欄の spellcheck などは、_assets/index.ts で表示に切り替えたときに
  // 入力がスペルチェックや予測変換に渡らないようにするため
  const html = await htmlDocument(ctx, {
    title: "ログイン",
    page: import.meta.url,
    slots: {
      main: (
        <>
          <h1>ログイン</h1>
          {message && <p role="alert">{message}</p>}
          <form method="post" action={path("/login")}>
            <CsrfInput token={await ctx.csrfToken()} />
            {to && <input type="hidden" name="to" value={to} />}
            <p>
              <label>
                ユーザー名{" "}
                <input name="username" autocomplete="username" required value={username} />
              </label>
            </p>
            <p>
              <label>
                パスワード{" "}
                <input
                  type="password"
                  name="password"
                  autocomplete="current-password"
                  required
                  spellcheck="false"
                  autocapitalize="off"
                  autocorrect="off"
                />
              </label>
            </p>
            <p>
              <button type="submit">ログイン</button>
            </p>
          </form>
        </>
      ),
    },
  });
  return new Response(html, {
    status,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}
