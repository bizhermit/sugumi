import { execFileSync } from "node:child_process";
import { createDb, type DataBase } from "../../../src/lib/db.ts";
import { createTestLogger } from "./logger.ts";

/**
 * DBを使うテストの共通処理。
 * テスト用DBは環境変数APP_TEST_DATABASE_URL（appロール）とAPP_TEST_MIGRATION_DATABASE_URL（migratorロール）で指定する。
 * テストファイルは並列に実行されるので、各ファイルは自分のprefixで始まるユーザー名だけを作り、消すこと。
 */

function requireEnv(name: string): string {
  const value = process.env[name];
  if (value == null || value === "") {
    throw new Error(`${name}を設定してください。DBを使用するテストに必要です。`);
  }
  return value;
}

export function prepareTestDb(): DataBase {
  const url = requireEnv("APP_TEST_DATABASE_URL");
  const migrationUrl = requireEnv("APP_TEST_MIGRATION_DATABASE_URL");
  execFileSync("node", ["src/migrate.ts"], {
    env: { ...process.env, APP_MIGRATION_DATABASE_URL: migrationUrl },
    stdio: ["ignore", "ignore", "inherit"],
  });
  return createDb(url, createTestLogger());
}

export async function deleteAccounts(db: DataBase, prefix: string): Promise<void> {
  await db.query("DELETE FROM accounts WHERE username LIKE $1", [`${prefix}%`]);
}

export async function deleteAddressFailures(db: DataBase, address: string): Promise<void> {
  await db.query("DELETE FROM login_throttles WHERE address = $1", [address]);
}
