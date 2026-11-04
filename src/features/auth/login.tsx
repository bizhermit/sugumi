import { page } from "../../web/html-document.tsx";

function get() {
  return page({
    title: "ログイン",
    slots: {
      main: (
        <main>
          <h1>ログイン</h1>
          <form method="post" action="/login">
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
          </form>
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
