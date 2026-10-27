/**
 * src/routes/ を読み、ルートの一覧を型 RoutePath に、GET で開けるルートを GET_ROUTES にして、src/routes.gen.ts に書き出す。
 * `--watch` を付けると、生成したあとも src/routes/ の変更を監視して、生成し直す。
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
 * routes のルートの一覧を out に書き出す。
 * テストでは routes・out に別の場所を渡す。
 */
export async function generateRoutes(routes: URL, out: URL): Promise<void> {
  const dirs = (await scanRoutes({ root: routes })).map(({ segments, methods }) => ({
    pattern: patternOf(segments),
    get: methods.some((name) => name.startsWith("get.")),
  })).sort((a, b) => a.pattern < b.pattern ? -1 : a.pattern > b.pattern ? 1 : 0);
  const union = dirs.length === 0
    ? " never"
    : dirs.map(({ pattern }) => `\n  | ${JSON.stringify(pattern)}`).join("");
  const gets = dirs.filter(({ get }) => get)
    .map(({ pattern }) => `\n  ${JSON.stringify(pattern)},`).join("");
  const content = `// deno task gen で src/routes/ から生成する。直接編集しないこと。
export type RoutePath =${union};

/** GET で開けるルート。e2e/ のテストが、すべての画面を開いて確かめるのに使う。 */
export const GET_ROUTES: ReadonlyArray<RoutePath> = [${gets}${gets ? "\n" : ""}];
`;
  const current = await Deno.readTextFile(out).catch(() => undefined);
  // 監視しているツールが無駄に反応しないよう、内容が同じなら書き込まない。
  if (content !== current) {
    await Deno.writeTextFile(out, content);
  }
}
