import type { Html } from "../lib/jsx-runtime.ts";
import { assetsOf } from "./assets.ts";
import { layoutsOf, type RouteContext } from "./router.ts";

/**
 * 関数を渡すと、外側の layout で決まったタイトルを受け取り、このページ・layout のタイトルを返す。
 * 外側でタイトルが決まっていなければ、htmlDocument() が例外を投げる。
 */
export type Title = string | ((outer: string) => string);

/**
 * layout に差し込む HTML。main はページの本体で、内側の layout が返した HTML が外側の layout の main になる。
 * main 以外のキーは、間の layout が使わなくても、外側の layout まで届く。
 */
export type Slots = { main: Html; [name: string]: Html | undefined };

/** layout.ts・layout.tree.ts の default export の形。 */
export type Layout = {
  title?: Title;
  /** slots を差し込んだ HTML を返す。 */
  render: (slots: Slots, ctx: RouteContext) => Html | Promise<Html>;
};

export type HtmlDocumentOptions = {
  title?: Title;
  slots: Slots;
  /**
   * ページのディレクトリにあるファイルの import.meta.url。このディレクトリに適用する layout で slots を包む。
   * 全ページ共通の src/web/_assets/ に続けて、同じディレクトリの `_assets/` の index.css と index.ts を読み込む。
   */
  page: string;
  /** false にすると layout を適用しない。 */
  layout?: false;
};

/**
 * ページの HTML 文書全体を返す。メソッドのファイルから呼び、戻り値をレスポンスボディにする。
 * タイトルが決まらないときは例外を投げる。
 */
export async function htmlDocument(
  ctx: RouteContext,
  options: HtmlDocumentOptions,
): Promise<string> {
  const { title, main } = await composePage(ctx, options);
  const common = assetsOf(import.meta.url);
  const own = assetsOf(options.page);
  const html = (
    <html lang="ja">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>{title}</title>
        {common.style && <link rel="stylesheet" href={common.style} />}
        {own.style && <link rel="stylesheet" href={own.style} />}
        {common.script && <script type="module" src={common.script}></script>}
        {own.script && <script type="module" src={own.script}></script>}
      </head>
      <body>{main}</body>
    </html>
  );
  return `<!doctype html>\n${html.value}\n`;
}

/**
 * page のディレクトリに適用する layout で slots を包み、タイトルと body の中身を返す。
 * タイトルが決まらないときは例外を投げる。
 * htmlDocument() と違って静的ファイルの URL を探さないので、src/ の外のページも渡せる。
 */
export async function composePage(
  ctx: RouteContext,
  { title, slots, page, layout }: HtmlDocumentOptions,
): Promise<{ title: string; main: Html }> {
  const layouts = layout === false ? [] : layoutsOf(page);
  let resolved: string | undefined;
  for (const l of layouts) resolved = applyTitle(resolved, l.title, page);
  resolved = applyTitle(resolved, title, page);
  if (resolved === undefined) {
    throw new Error(`${page}: タイトルが決まっていません`);
  }

  if (layouts.length === 0) {
    return { title: resolved, main: slots.main };
  }
  // 呼び出し側の slots を書き換えないよう 1 回だけコピーし、main を内側の layout の結果で置き換えていく。
  // 次の layout を呼ぶのは render が Html を返し終えてからなので、前の layout に渡した slots があとで変わっても影響しない。
  const current = { ...slots };
  for (let i = layouts.length - 1; i >= 0; i--) {
    current.main = await layouts[i].render(current, ctx);
  }
  return { title: resolved, main: current.main };
}

function applyTitle(
  outer: string | undefined,
  title: Title | undefined,
  page: string,
): string | undefined {
  if (typeof title === "string") return title;
  if (!title) return outer;
  if (outer === undefined) {
    throw new Error(`${page}: 外側の layout でタイトルが決まっていません`);
  }
  return title(outer);
}
