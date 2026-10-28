import assert from "node:assert/strict";
import { splitPassword, updateSchemaVersion } from "../../scripts/migrate.ts";
import { withTempDir } from "../_support/fixture.ts";

Deno.test("migrate: URL からパスワードを外し、デコードして返す", () => {
  assert.deepEqual(splitPassword("postgres://migrator:p%40ss@db:5432/app_test?sslmode=disable"), {
    status: "ok",
    url: "postgres://migrator@db:5432/app_test?sslmode=disable",
    password: "p@ss",
  });
});

Deno.test("migrate: クエリに書いたパスワードも外す", () => {
  assert.deepEqual(
    splitPassword("postgres://migrator@db:5432/app_test?password=p%40ss&sslmode=disable"),
    {
      status: "ok",
      url: "postgres://migrator@db:5432/app_test?sslmode=disable",
      password: "p@ss",
    },
  );
});

Deno.test("migrate: パスワードのない URL は、そのまま返す", () => {
  assert.deepEqual(splitPassword("postgres://migrator@db:5432/app_test"), {
    status: "ok",
    url: "postgres://migrator@db:5432/app_test",
    password: undefined,
  });
});

Deno.test("migrate: postgres:// の URL として読めなければ invalid を返す", () => {
  for (
    const value of [
      "host=db user=migrator password=secret dbname=app",
      "postgres://migrator:secret@h1:5432,h2:5433/app",
      "https://migrator:secret@db/app",
    ]
  ) {
    assert.deepEqual(splitPassword(value), { status: "invalid" }, value);
  }
});

const SCHEMA_VERSION_FILE = "/** 説明。 */\nexport const SCHEMA_VERSION = 1;\n";

Deno.test("migrate: SCHEMA_VERSION を最後のマイグレーションの番号に書き換える", async () => {
  await withTempDir({
    "src/lib/schema-version.ts": SCHEMA_VERSION_FILE,
    "docker/db/migrations/0001_a.sql": "SELECT 1;",
    "docker/db/migrations/0002_b.sql": "SELECT 1;",
  }, async (root) => {
    assert.equal(await updateSchemaVersion(root), 2);
    assert.equal(
      await Deno.readTextFile(new URL("src/lib/schema-version.ts", root)),
      "/** 説明。 */\nexport const SCHEMA_VERSION = 2;\n",
    );
  });
});

Deno.test("migrate: SCHEMA_VERSION が同じなら、ファイルを書き換えない", async () => {
  await withTempDir({
    "src/lib/schema-version.ts": SCHEMA_VERSION_FILE,
    "docker/db/migrations/0001_a.sql": "SELECT 1;",
  }, async (root) => {
    const file = new URL("src/lib/schema-version.ts", root);
    const before = (await Deno.stat(file)).mtime;
    assert.equal(await updateSchemaVersion(root), undefined);
    assert.deepEqual((await Deno.stat(file)).mtime, before);
  });
});
