import assert from "node:assert/strict";
import { checkSchemaVersion } from "../../scripts/check-schema-version.ts";
import { SCHEMA_VERSION } from "../../src/lib/schema-version.ts";
import { withTempDir } from "../_support/fixture.ts";

const MIGRATIONS = {
  "docker/db/migrations/0001_a.sql": "SELECT 1;",
  "docker/db/migrations/0002_b.sql": "SELECT 1;",
  "docker/db/migrations/CLAUDE.md": "",
  "docker/db/migrations/README.sql": "",
};

Deno.test("check-schema-version: 最後のマイグレーションの番号と同じなら、違反にしない", async () => {
  await withTempDir(MIGRATIONS, async (root) => {
    assert.equal(await checkSchemaVersion(root, 2), undefined);
  });
});

Deno.test("check-schema-version: 最後のマイグレーションの番号と違えば、違反にする", async () => {
  await withTempDir(MIGRATIONS, async (root) => {
    assert.equal(
      await checkSchemaVersion(root, 1),
      "src/lib/schema-version.ts の SCHEMA_VERSION を、最後のマイグレーションの番号に揃えてください: SCHEMA_VERSION 1、マイグレーション 2",
    );
  });
});

Deno.test("check-schema-version: リポジトリの SCHEMA_VERSION は、最後のマイグレーションの番号と同じ", async () => {
  assert.equal(
    await checkSchemaVersion(new URL("../../", import.meta.url), SCHEMA_VERSION),
    undefined,
  );
});
