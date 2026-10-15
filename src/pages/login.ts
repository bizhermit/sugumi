export default function (_req: Request): Response {
  const html = `<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>ログイン</title>
</head>
<body>
</body>
</html>
`;
  return new Response(html, {
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}
