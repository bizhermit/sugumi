/**
 * src/routes/ と同じ構成のディレクトリを作り、loadRouter({ root }) で読み込むための部品。
 * ルートのファイルは import して動かすので、実際のファイルとして書き出す必要がある。
 */
import { withTempDir } from "./fixture.ts";

const JSX_RUNTIME = new URL("../../src/lib/jsx-runtime.ts", import.meta.url).href;

/** before・ハンドラ・layout が呼ばれた順に、その名前が入る。withFixture() を呼ぶたびに空になる。 */
export const calls: Array<string> = (globalThis as unknown as { calls: Array<string> }).calls = [];

const RECORD = "(globalThis as unknown as { calls: Array<string> }).calls.push";

/** 呼ばれると calls に name を記録して undefined を返す before の、ファイルの中身を返す。 */
export function before(name: string): string {
  return `export default () => { ${RECORD}(${JSON.stringify(name)}); };`;
}

/** 呼ばれると calls に name を記録し、name をレスポンスボディにして返すハンドラの、ファイルの中身を返す。 */
export function handler(name: string): string {
  return `export default () => { ${RECORD}(${JSON.stringify(name)}); return new Response(${
    JSON.stringify(name)
  }); };`;
}

/**
 * main を `[name main]` の形で包み、slots.aside があれば `{aside}` も付ける layout の、ファイルの中身を返す。
 * title には、default export の title に書く式のソースを渡す（例：`"サイト"`、`(t: string) => t + " - 管理"`）。
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

/**
 * calls を空にしてから、files（routes/ からの相対パス → 内容）のとおりにファイルを置いたディレクトリを作って fn に渡す。
 * fn が終わったら消す。
 */
export async function withFixture(
  files: Record<string, string>,
  fn: (root: URL) => Promise<void>,
): Promise<void> {
  calls.length = 0;
  await withTempDir(files, fn);
}
