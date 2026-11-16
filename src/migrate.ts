import { readdir, readFile } from "node:fs/promises";
import { Client } from "pg";
import { loadMigrationConfig } from "./lib/config.ts";
import { join, parse } from "node:path";

const MIGRATIONS_DIR = "db/migrations";
const FILE_PATTERN = /^[a-z0-9_-]+\.sql$/;

type Migration = {
  readonly name: string;
  readonly nameWithoutExtension: string;
};

async function getMigrations(): Promise<Migration[]> {
  const names = (await readdir(MIGRATIONS_DIR)).toSorted();
  const result: Migration[] = [];
  for (const name of names) {
    const match = FILE_PATTERN.exec(name);
    if (match == null) continue;
    const nameWithoutExtension = parse(name).name;
    if (nameWithoutExtension.length > 120) {
      throw new Error(
        `マイグレーションファイルの名前は、拡張子を除いて120文字以内にしてください: ${nameWithoutExtension}`,
      );
    }
    result.push({ name, nameWithoutExtension });
  }
  return result;
}

async function migrate(db: Client, migrations: readonly Migration[]) {
  await db.query("BEGIN");
  await db.query("SELECT pg_advisory_xact_lock(7316001)");
  await db.query(
    "CREATE TABLE IF NOT EXISTS schema_migrations (name varchar(120) PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())",
  );
  await db.query("REVOKE INSERT, UPDATE, DELETE ON schema_migrations FROM app");

  const { rows } = await db.query<{ name: string }>("SELECT name from schema_migrations");
  let updated = 0;
  /* oxlint-disable no-await-in-loop */
  for (const migration of migrations) {
    if (rows.some((row) => row.name === migration.nameWithoutExtension)) continue;
    const sql = await readFile(join(MIGRATIONS_DIR, migration.name), "utf8");
    await db.query(sql);
    await db.query("INSERT INTO schema_migrations (name) VALUES ($1)", [migration.nameWithoutExtension]);
    console.log(`- ${migration.nameWithoutExtension}`);
    updated++;
  }
  /* oxlint-enable no-await-in-loop */
  await db.query("COMMIT");
  if (updated > 0) {
    console.log("マイグレーションを適用しました。");
  } else {
    console.log("適用するマイグレーションがありません。");
  }
}

async function main() {
  const migrations = await getMigrations();
  const config = loadMigrationConfig();
  const db = new Client({ connectionString: config.databaseUrl });
  await db.connect();
  try {
    await migrate(db, migrations);
  } catch (err) {
    await db.query("ROLLBACK");
    throw err;
  } finally {
    await db.end();
  }
}

await main();
