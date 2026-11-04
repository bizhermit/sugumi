function get(): Response {
  const page = (
    <html lang="ja">
      <head>
        <meta charset="utf-8" />
        <title>設定</title>
      </head>
      <body>
        <h1>ユーザー設定</h1>
        <ul>
          <li>
            <a href="/home">ホーム</a>
          </li>
        </ul>
      </body>
    </html>
  );

  return new Response(`<!doctype html>${page.value}`, { headers: { "content-type": "text/html; charset=utf-8" } });
}

export { get };
