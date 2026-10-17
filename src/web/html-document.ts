import { escapeHtml } from "../lib/html.ts";
import { assetsOf } from "./assets.ts";

export type HtmlDocumentOptions = {
  title: string;
  /** エスケープ済みの HTML。 */
  body: string;
  /**
   * ページのディレクトリにあるファイルの import.meta.url。同じディレクトリの `_assets/` の index.css と index.ts を、
   * 全ページ共通の src/web/_assets/ のものに続けて読み込む。
   */
  page?: string;
};

/** ページの HTML 文書全体を返す。 */
export function htmlDocument({ title, body, page }: HtmlDocumentOptions): string {
  const common = assetsOf(import.meta.url);
  const own = page ? assetsOf(page) : {};
  const tags = [
    ...[common.style, own.style].map((url) =>
      url && `<link rel="stylesheet" href="${escapeHtml(url)}">`
    ),
    ...[common.script, own.script].map((url) =>
      url && `<script type="module" src="${escapeHtml(url)}"></script>`
    ),
  ].filter(Boolean).join("\n");
  return `<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
${tags}
</head>
<body>
${body}
</body>
</html>
`;
}
