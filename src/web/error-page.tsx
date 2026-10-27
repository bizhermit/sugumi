// 404 などはリクエストのたびに返すため、HTML はステータスごとに 1 回だけ組み立てる。
// status はコードに書いた値だけなので、種類は増えない
const pages = new Map<number, string>();
const HEADERS = { "content-type": "text/html; charset=utf-8" };

export function errorPage(status: number): Response {
  let html = pages.get(status);
  if (html === undefined) {
    html = render(status);
    pages.set(status, html);
  }
  return new Response(html, { status, headers: HEADERS });
}

function render(status: number) {
  const html = (
    <html lang="ja">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>{status}</title>
      </head>
      <body>
        <h1>{status}</h1>
      </body>
    </html>
  );
  return `<!doctype html>\n${html.value}\n`;
}

export function methodNotAllowed(allow: Array<string>): Response {
  const res = errorPage(405);
  res.headers.set("allow", allow.join(", "));
  return res;
}
