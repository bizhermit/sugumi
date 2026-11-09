import { Form } from "../../components/form/form.tsx";
import { asset } from "../../web/assets.ts";
import { formSlot } from "../../web/form.ts";
import { page } from "../../web/html-document.tsx";
import { STATUS_TEXTS } from "../../web/http-error.ts";

const styles = [asset(import.meta.resolve("./_assets/login.css"))];
const scripts = [asset(import.meta.resolve("./_assets/login.ts"))];

function get(req: Request) {
  return page({
    title: "ログイン",
    styles,
    scripts,
    slots: {
      main: (
        <main>
          <h1>ログイン</h1>
          <Form req={req} method="post" action="/login" className="login-form">
            <p>
              <label>
                ユーザー <input name="username" autocomplete="username" required />
              </label>
            </p>
            <p>
              <label>
                パスワード <input type="password" name="password" autocomplete="current-password" required />
              </label>
            </p>
            <p>
              <button type="submit">ログイン</button>
            </p>
          </Form>
        </main>
      ),
    },
  });
}

function post(req: Request): Response {
  const form = formSlot.get(req);
  // 暫定処理。認証は未実装で、入力があればログインしたことにする。
  if (!form.has("username") || !form.has("password")) {
    return new Response(STATUS_TEXTS[400], { status: 400 });
  }
  return new Response(null, { status: 302, headers: { Location: "/home" } });
}

export { get, post };
