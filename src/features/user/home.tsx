function get(): Response {
  const page = (
    <html lang="ja">
      <head>
        <meta charset="utf-8" />
        <title>ホーム</title>
      </head>
      <body>
        <h1>ホーム</h1>
        <ul>
          <li>
            <a href="/login">ログインへ</a>
          </li>
          <li>
            <a href="/settings">アプリ設定</a>
          </li>
          <li>
            <a href="/user">ユーザー設定</a>
          </li>
        </ul>
      </body>
    </html>
  );

  return new Response(`<!doctype html>${page.value}`, { headers: { "content-type": "text/html; charset=utf-8" } });
}

export { get };
