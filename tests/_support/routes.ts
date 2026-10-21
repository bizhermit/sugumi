/**
 * src/routes/ と同じ形のディレクトリを作り、loadRouter({ root }) で読み込ませるための部品。
 * ルートのファイルは import されて動くため、ファイルとして書き出す必要がある。
 */
import { withTempDir } from "./fixture.ts";

const JSX_RUNTIME = new URL("../../src/lib/jsx-runtime.ts", import.meta.url).href;

/** before・ハンドラ・layout が呼ばれた順に名前を記録する。withFixture() が空にする。 */
export const calls: string[] = (globalThis as unknown as { calls: string[] }).calls = [];

const RECORD = "(globalThis as unknown as { calls: string[] }).calls.push";

/** 呼ばれたら name を記録して undefined を返す before。 */
export function before(name: string): string {
  return `export default () => { ${RECORD}(${JSON.stringify(name)}); };`;
}

/** 呼ばれたら name を記録し、name を本文にして返すハンドラ。 */
export function handler(name: string): string {
  return `export default () => { ${RECORD}(${JSON.stringify(name)}); return new Response(${
    JSON.stringify(name)
  }); };`;
}

/**
 * main を `[name main]` で包み、slots.aside があれば `{aside}` を付ける layout。
 * title は default export の title に書く式のソース（例：`"サイト"`、`(t: string) => t + " - 管理"`）。
 */
export function layout(name: string, title?: string): string {
  return `import { jsxTemplate } from ${JSON.stringify(JSX_RUNTIME)};
export default {
  ${title === undefined ? "" : `title: ${title},`}
  render: (slots: { main: unknown; aside?: unknown }) =>
    slots.aside === undefined
      ? jsxTemplate([${JSON.stringify(`[${name} `)}, "]"], slots.main)
      : jsxTemplate([${JSON.stringify(`[${name} `)}, " {", "}]"], slots.main, slots.aside),
};`;
}

/** files（routes/ からの相対パス → 内容）でディレクトリを作って fn に渡し、終わったら消す。 */
export async function withFixture(
  files: Record<string, string>,
  fn: (root: URL) => Promise<void>,
): Promise<void> {
  calls.length = 0;
  await withTempDir(files, fn);
}
