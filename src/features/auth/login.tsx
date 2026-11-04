function get(): Response {
  const page = (
    <html lang="ja">
      <head>
        <meta charset="utf-8" />
        <title>ログイン</title>
      </head>
      <body>
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
      </body>
    </html>
  );

  return new Response(`<!doctype html>${page.value}`, { headers: { "content-type": "text/html; charset=utf-8" } });
}

function post(): Response {
  // 暫定処理
  return new Response(null, { status: 302, headers: { Location: "/home" } });
}

export { get, post };
