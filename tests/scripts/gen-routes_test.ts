import assert from "node:assert/strict";
import { generateRoutes } from "../../scripts/gen-routes.ts";
import { withTempDir } from "../_support/fixture.ts";
import { handler } from "../_support/routes.ts";

Deno.test("gen-routes: ルートのパターンを並べた RoutePath と、GET で開けるルートの一覧を書き出す", async () => {
  await withTempDir({
    "routes/get.ts": handler("/"),
    "routes/user/[id]/get.ts": handler("/user/[id]"),
    "routes/about/post.ts": handler("/about"),
    "routes/_parts/get.ts": handler("ignored"),
  }, async (dir) => {
    const out = new URL("routes.gen.ts", dir);
    await generateRoutes(new URL("routes/", dir), out);
    assert.equal(
      await Deno.readTextFile(out),
      `// deno task gen で src/routes/ から生成する。直接編集しないこと。
export type RoutePath =
  | "/"
  | "/about"
  | "/user/[id]";

/** GET で開けるルート。e2e/ のテストが、すべての画面を開いて確かめるのに使う。 */
export const GET_ROUTES: readonly RoutePath[] = [
  "/",
  "/user/[id]",
];
`,
    );
  });
});

Deno.test("gen-routes: ルートがなければ never にする", async () => {
  await withTempDir({ "routes/view.tsx": "" }, async (dir) => {
    const out = new URL("routes.gen.ts", dir);
    await generateRoutes(new URL("routes/", dir), out);
    assert.match(
      await Deno.readTextFile(out),
      /export type RoutePath = never;\n\n.*\nexport const GET_ROUTES: readonly RoutePath\[\] = \[\];\n$/,
    );
  });
});

Deno.test("gen-routes: 内容が変わらなければ書き込まない", async () => {
  await withTempDir({ "routes/get.ts": handler("/") }, async (dir) => {
    const out = new URL("routes.gen.ts", dir);
    await generateRoutes(new URL("routes/", dir), out);
    const before = (await Deno.stat(out)).mtime;
    await new Promise((resolve) => setTimeout(resolve, 20));
    await generateRoutes(new URL("routes/", dir), out);
    assert.deepEqual((await Deno.stat(out)).mtime, before);
  });
});
