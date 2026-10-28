/**
 * src/lib/schema-version.ts の SCHEMA_VERSION が、docker/db/migrations/ の最後のマイグレーションの番号と同じかを確かめる。
 * 違えば、理由を出して終了コード 1 で終わる。deno task build がバンドルの前に実行する。
 *
 * テストではなく build で確かめるのは、イメージのビルド（docker/app/Dockerfile）でも必ず通るため。
 * テストを実行せずに作ったイメージが、マイグレーションした DB で起動しなくなるのを防ぐ。
 */
import { SCHEMA_VERSION } from "../src/lib/schema-version.ts";

// db-migrate が適用するファイル名（4 桁の番号_説明.sql）。番号以外の検査は db-migrate に任せる
const MIGRATION_FILE = /^(\d{4})_.*\.sql$/;

if (import.meta.main) {
  const error = await checkSchemaVersion(new URL("../", import.meta.url), SCHEMA_VERSION);
  if (error !== undefined) {
    console.error(error);
    Deno.exit(1);
  }
}

/** root（リポジトリのルート）の docker/db/migrations/ の最後の番号が version と違えば、理由を返す。同じなら undefined を返す。 */
export async function checkSchemaVersion(root: URL, version: number): Promise<string | undefined> {
  const last = await lastMigrationVersion(root);
  if (last === version) return undefined;
  return `src/lib/schema-version.ts の SCHEMA_VERSION を、最後のマイグレーションの番号に揃えてください: SCHEMA_VERSION ${version}、マイグレーション ${last}`;
}

/** root（リポジトリのルート）の docker/db/migrations/ の最後のマイグレーションの番号を返す。なければ 0 を返す。 */
export async function lastMigrationVersion(root: URL): Promise<number> {
  let last = 0;
  for await (const entry of Deno.readDir(new URL("docker/db/migrations/", root))) {
    const match = MIGRATION_FILE.exec(entry.name);
    if (match !== null) {
      last = Math.max(last, Number(match[1]));
    }
  }
  return last;
}
