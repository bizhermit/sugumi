import assert from "node:assert/strict";
import { checkBundle } from "../../scripts/check-bundle.ts";
import { withTempDir } from "../_support/fixture.ts";

/** maps（dist/public/ からのパス → sources）のソースマップを置いて checkBundle() を実行し、違反の一覧を返す。 */
async function violationsOf(maps: Record<string, Array<string>>) {
  const files = Object.fromEntries(
    Object.entries(maps).map(([path, sources]) => [
      `dist/public/${path}`,
      JSON.stringify({ version: 3, sources }),
    ]),
  );
  let result: Array<string> = [];
  await withTempDir({ "dist/public/routes/a/_assets/index.js": "", ...files }, async (root) => {
    result = await checkBundle(root);
  });
  return result;
}

Deno.test("check-bundle: _assets/ と _shared/ のソースだけなら違反にしない", async () => {
  assert.deepEqual(
    await violationsOf({
      "routes/a/_assets/index.js.map": [
        "../../../../../src/routes/a/_assets/index.ts",
        "../../../../../src/lib/_shared/format.ts",
      ],
    }),
    [],
  );
});

Deno.test("check-bundle: それ以外のソースがバンドルに入っていれば違反にする", async () => {
  assert.deepEqual(
    await violationsOf({
      "routes/a/_assets/index.js.map": [
        "../../../../../src/routes/a/_assets/index.ts",
        "../../../../../src/lib/db.ts",
        "../../../../../node_modules/pg/index.js",
      ],
    }),
    [
      "dist/public/routes/a/_assets/index.js.map: src/lib/db.ts がバンドルに含まれています",
      "dist/public/routes/a/_assets/index.js.map: node_modules/pg/index.js がバンドルに含まれています",
    ],
  );
});

Deno.test("check-bundle: ソースマップがなければ、何も確かめられないので違反にする", async () => {
  assert.deepEqual(await violationsOf({}), ["dist/public/ にソースマップがありません"]);
});
