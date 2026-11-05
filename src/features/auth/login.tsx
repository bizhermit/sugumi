import { Form } from "../../components/form/form.tsx";
import { asset } from "../../web/assets.ts";
import { page } from "../../web/html-document.tsx";

const styles = [asset(import.meta.resolve("./_assets/login.css"))];
const scripts = [asset(import.meta.resolve("./_assets/login.ts"))];

function get() {
  return page({
    title: "ログイン",
    styles,
    scripts,
    slots: {
      main: (
        <main>
          <h1>ログイン</h1>
          <Form method="post" action="/login">
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

function post(): Response {
  // 暫定処理
  return new Response(null, { status: 302, headers: { Location: "/home" } });
}

export { get, post };
