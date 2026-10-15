/**
 * src/pages/ からルートの一覧を型 RoutePath として src/routes.gen.ts に書き出す。
 * `--watch` を付けると、生成したあと src/pages/ の変更を監視して生成し直す。
 */
import { scanPages } from "../src/web/router.ts";

const PAGES_DIR = new URL("../src/pages/", import.meta.url);
const OUT = new URL("../src/routes.gen.ts", import.meta.url);

async function generate(): Promise<void> {
  const patterns = (await scanPages())
    .map(({ segments }) =>
      "/" + segments.map((s) => "param" in s ? `[${s.param}]` : s.literal).join("/")
    )
    .sort();
  const union = patterns.length === 0
    ? " never"
    : patterns.map((p) => `\n  | ${JSON.stringify(p)}`).join("");
  const content = `// deno task gen で src/pages/ から生成する。直接編集しないこと。
export type RoutePath =${union};
`;
  const current = await Deno.readTextFile(OUT).catch(() => undefined);
  // 内容が同じなら書き込まない（監視しているツールを無駄に反応させないため）
  if (content !== current) await Deno.writeTextFile(OUT, content);
}

await generate();

if (Deno.args.includes("--watch")) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  for await (const _ of Deno.watchFs(decodeURIComponent(PAGES_DIR.pathname))) {
    clearTimeout(timer);
    timer = setTimeout(() => generate().catch(console.error), 100);
  }
}
