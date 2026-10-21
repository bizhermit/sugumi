import type { Html } from "../lib/jsx-runtime.ts";
import { assetsOf } from "./assets.ts";
import { layoutsOf, type RouteContext } from "./router.ts";

/**
 * 関数は、外側の layout で決まったタイトルを受け取って、このページ・layout のタイトルを返す。
 * 外側でタイトルが決まっていなければ、htmlDocument が例外を投げる。
 */
export type Title = string | ((outer: string) => string);

/**
 * layout に差し込む HTML。main はページの本文で、内側の layout が返した HTML は
 * 外側の layout の main になる。それ以外のキーは、間の layout が使わなくても外側の layout まで届く。
 */
export type Slots = { main: Html; [name: string]: Html | undefined };

/** layout.ts・layout.tree.ts が default export で公開する。 */
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
   * 同じディレクトリの `_assets/` の index.css と index.ts を、全ページ共通の src/web/_assets/ のものに続けて読み込む。
   */
  page: string;
  /** false にすると layout を適用しない。 */
  layout?: false;
};

/** ページの HTML 文書全体を返す。タイトルが決まらない場合は例外を投げる。 */
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
 * page のディレクトリに適用する layout で slots を包み、タイトルと本文を返す。タイトルが決まらない場合は例外を投げる。
 * htmlDocument() と違い、src/ の外のページも渡せる（静的ファイルの URL を引かないため）。
 */
export async function composePage(
  ctx: RouteContext,
  { title, slots, page, layout }: HtmlDocumentOptions,
): Promise<{ title: string; main: Html }> {
  const layouts = layout === false ? [] : layoutsOf(page);
  let resolved: string | undefined;
  for (const t of [...layouts.map((l) => l.title), title]) {
    if (typeof t === "string") resolved = t;
    else if (t) {
      if (resolved === undefined) {
        throw new Error(`${page}: 外側の layout でタイトルが決まっていません`);
      }
      resolved = t(resolved);
    }
  }
  if (resolved === undefined) throw new Error(`${page}: タイトルが決まっていません`);

  let current = slots;
  for (const { render } of layouts.toReversed()) {
    current = { ...current, main: await render(current, ctx) };
  }
  return { title: resolved, main: current.main };
}
