import assert from "node:assert/strict";
import { checkImports } from "../../scripts/check-imports.ts";
import { withTempDir } from "../_support/fixture.ts";

/** files に空の scripts/ を足してリポジトリと同じ構成にし、checkImports() の違反の一覧を返す。 */
async function violationsOf(files: Record<string, string>) {
  let result: Array<string> = [];
  await withTempDir({ "scripts/.keep": "", ...files }, async (root) => {
    result = await checkImports(root);
  });
  return result;
}

Deno.test("check-imports: 取り決めに沿った import は違反にしない", async () => {
  assert.deepEqual(
    await violationsOf({
      "src/lib/db.ts": `import pg from "pg";`,
      "src/lib/_shared/format.ts": `export const x = 1;`,
      "src/routes/a/_shared/rule.ts": `import { x } from "../../../lib/_shared/format.ts";`,
      "src/routes/a/get.ts": `import { x } from "../../lib/_shared/format.ts";
import { db } from "../../lib/db.ts";`,
      "src/routes/a/_assets/index.ts": `import { part } from "./part.ts";
import { x } from "../../../lib/_shared/format.ts";
import { rule } from "../_shared/rule.ts";`,
      "src/routes/a/_assets/part.ts": `export const part = 1;`,
      "src/routes/a/get.mock.ts": `import { data } from "./data.mock.ts";`,
      "src/routes/a/data.mock.ts": `export const data = 1;`,
    }),
    [],
  );
});

Deno.test("check-imports: 境界を越える import を、ファイルと行で示す", async () => {
  const violations = await violationsOf({
    "src/lib/db.ts": ``,
    "src/routes/a/_assets/index.ts": `import "./ok.ts";
import { db } from "../../../lib/db.ts";
import { b } from "../../b/_assets/index.ts";
import { readFile } from "node:fs";`,
    "src/routes/a/_assets/ok.ts": ``,
    "src/routes/b/_assets/index.ts": ``,
    "src/routes/a/get.ts": `import "./_assets/index.ts";`,
    "src/lib/_shared/x.ts": `import { db } from "../db.ts";`,
  });
  assert.deepEqual(violations.toSorted(), [
    "src/lib/_shared/x.ts:1: ../db.ts を import できません（_shared/ からは _shared/ だけを import できます）",
    "src/routes/a/_assets/index.ts:2: ../../../lib/db.ts を import できません（_assets/ からは、同じ _assets/ の中と _shared/ だけを import できます）",
    "src/routes/a/_assets/index.ts:3: ../../b/_assets/index.ts を import できません（_assets/ からは、同じ _assets/ の中と _shared/ だけを import できます）",
    "src/routes/a/_assets/index.ts:4: node:fs を import できません（_assets/ と _shared/ からは相対パスだけを import できます）",
    "src/routes/a/get.ts:1: ./_assets/index.ts を import できません（_assets/ はブラウザ専用です）",
  ]);
});

Deno.test("check-imports: *.mock.* は *.mock.* からだけ import できる", async () => {
  assert.deepEqual(
    await violationsOf({
      "src/routes/a/get.ts": `import { data } from "./data.mock.ts";`,
      "src/routes/a/data.mock.ts": ``,
    }),
    [
      "src/routes/a/get.ts:1: ./data.mock.ts を import できません（*.mock.* は *.mock.* からだけ import できます）",
    ],
  );
});

Deno.test("check-imports: src/_shared/・_assets/ の JSX・変数の import() を違反にする", async () => {
  const violations = await violationsOf({
    "src/_shared/x.ts": ``,
    "src/routes/a/_assets/view.tsx": ``,
    "src/lib/_shared/view.jsx": ``,
    "src/routes/a/_assets/index.ts": `const name = "./x.ts";
await import(name);
await import("./ok.ts");`,
    "src/routes/a/_assets/ok.ts": ``,
    // サーバーでは変数の import() を使ってよい（ルーターが使う）。
    "src/web/router.ts": `const mod = await import(url);`,
  });
  assert.deepEqual(violations.toSorted(), [
    "src/_shared/: 作れません（src/lib/_shared/ に置いてください）",
    "src/lib/_shared/view.jsx: JSX はサーバー専用です",
    "src/routes/a/_assets/index.ts:2: import() には文字列を直接書いてください",
    "src/routes/a/_assets/view.tsx: JSX はサーバー専用です",
  ]);
});

Deno.test("check-imports: scripts/ も確かめる", async () => {
  assert.deepEqual(
    await violationsOf({
      "src/routes/a/_assets/index.ts": ``,
      "scripts/x.ts": `import "../src/routes/a/_assets/index.ts";`,
    }),
    [
      "scripts/x.ts:1: ../src/routes/a/_assets/index.ts を import できません（_assets/ はブラウザ専用です）",
    ],
  );
});
