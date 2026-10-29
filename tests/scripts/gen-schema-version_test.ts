import assert from "node:assert/strict";
import { isSchemaVersionCurrent, writeSchemaVersion } from "../../scripts/gen-schema-version.ts";
import { withTempDir } from "../_support/fixture.ts";

// db-migrate --check でマイグレーションを読む部分は、テストの権限に sh の実行を許さないため、ここでは確かめない。
// CI の deno task gen（schema-version.gen.ts の差分）と deno task build が、リポジトリのマイグレーションで確かめる。

Deno.test("gen-schema-version: SCHEMA_VERSION を書き出す", async () => {
  await withTempDir({}, async (dir) => {
    const out = new URL("schema-version.gen.ts", dir);
    await writeSchemaVersion(2, out);
    assert.equal(
      await Deno.readTextFile(out),
      `// deno task gen で docker/db/migrations/ から生成する。直接編集しないこと。

/** アプリが前提にする DB スキーマのバージョン。DB のバージョンと違えば、アプリは起動しない（src/lib/db.ts）。 */
export const SCHEMA_VERSION = 2;
`,
    );
  });
});

Deno.test("gen-schema-version: 内容が同じなら、ファイルを書き換えない", async () => {
  await withTempDir({}, async (dir) => {
    const out = new URL("schema-version.gen.ts", dir);
    await writeSchemaVersion(2, out);
    const before = (await Deno.stat(out)).mtime;
    await writeSchemaVersion(2, out);
    assert.deepEqual((await Deno.stat(out)).mtime, before);
  });
});

Deno.test("gen-schema-version: 生成したものと同じかを確かめる", async () => {
  await withTempDir({}, async (dir) => {
    const out = new URL("schema-version.gen.ts", dir);
    assert.equal(await isSchemaVersionCurrent(2, out), false);
    await writeSchemaVersion(2, out);
    assert.equal(await isSchemaVersionCurrent(2, out), true);
    assert.equal(await isSchemaVersionCurrent(3, out), false);
  });
});
