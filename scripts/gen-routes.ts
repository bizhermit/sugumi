/**
 * src/routes/ からルートの一覧を型 RoutePath として src/routes.gen.ts に書き出す。
 * `--watch` を付けると、生成したあと src/routes/ の変更を監視して生成し直す。
 */
import { patternOf, scanRoutes } from "../src/web/router.ts";

const ROUTES_DIR = new URL("../src/routes/", import.meta.url);
const OUT = new URL("../src/routes.gen.ts", import.meta.url);

if (import.meta.main) {
  await generateRoutes(ROUTES_DIR, OUT);
  if (Deno.args.includes("--watch")) {
    let timer: ReturnType<typeof setTimeout> | undefined;
    for await (const _ of Deno.watchFs(decodeURIComponent(ROUTES_DIR.pathname))) {
      clearTimeout(timer);
      timer = setTimeout(() => generateRoutes(ROUTES_DIR, OUT).catch(console.error), 100);
    }
  }
}

/**
 * routes のルートの一覧を out に書き出す。内容が変わらなければ書き込まない。
 * routes・out はテストで別の場所を渡す。
 */
export async function generateRoutes(routes: URL, out: URL): Promise<void> {
  const patterns = (await scanRoutes({ root: routes })).map(({ segments }) => patternOf(segments))
    .sort();
  const union = patterns.length === 0
    ? " never"
    : patterns.map((p) => `\n  | ${JSON.stringify(p)}`).join("");
  const content = `// deno task gen で src/routes/ から生成する。直接編集しないこと。
export type RoutePath =${union};
`;
  const current = await Deno.readTextFile(out).catch(() => undefined);
  // 内容が同じなら書き込まない（監視しているツールを無駄に反応させないため）
  if (content !== current) await Deno.writeTextFile(out, content);
}
