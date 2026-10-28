/**
 * DB のスキーマの変更（マイグレーション）。アプリとは別に、src/migrate.ts から DB ユーザー migrator で実行する。
 * アプリ（DB ユーザー app）はテーブルの読み書きしかできないので、スキーマを変えられない。
 *
 * スキーマを変えるときは MIGRATIONS の末尾に追加し、適用済みの要素は書き換えないこと。
 * どこまで適用したかは schema_migrations テーブルに記録し、アプリは起動時にそれが MIGRATIONS の数と同じかを確かめる。
 *
 * migrator が作ったテーブル・シーケンスには、app が読み書きできる権限が自動で付く（docker/db/init/10-app-role.sh）。
 * スキーマを足すときは、同じマイグレーションで GRANT USAGE ON SCHEMA <スキーマ> TO app を実行する。
 * 読ませるだけにしたいテーブルは、REVOKE で権限を外す（schema_migrations と同じ）。
 * 関数には PUBLIC の EXECUTE が付くので、SECURITY DEFINER の関数を作るときは、REVOKE EXECUTE ... FROM PUBLIC をする。
 * しないと、app が migrator の権限で実行できてしまう。
 */
// @ts-types="npm:@types/pg@8.23.1"
import type pg from "pg";

export const MIGRATIONS: ReadonlyArray<string> = [
  `
  CREATE TABLE accounts (
    id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    username text NOT NULL UNIQUE,
    display_name text NOT NULL,
    password_hash text NOT NULL,
    failed_attempts integer NOT NULL DEFAULT 0,
    locked_until timestamptz
  );

  CREATE TABLE sessions (
    token_hash text PRIMARY KEY,
    account_id integer NOT NULL REFERENCES accounts (id) ON DELETE CASCADE,
    created_at timestamptz NOT NULL,
    last_access_at timestamptz NOT NULL
  );
  CREATE INDEX sessions_account_id ON sessions (account_id);

  CREATE TABLE secrets (
    name text PRIMARY KEY,
    value bytea NOT NULL
  );
  `,
  `
  CREATE TABLE login_throttles (
    address text PRIMARY KEY,
    window_started_at timestamptz NOT NULL,
    failed_attempts integer NOT NULL,
    blocked_until timestamptz
  );
  `,
  `
  CREATE TABLE login_devices (
    token_hash text PRIMARY KEY,
    account_id integer NOT NULL REFERENCES accounts (id) ON DELETE CASCADE,
    failed_attempts integer NOT NULL DEFAULT 0,
    expires_at timestamptz NOT NULL
  );
  CREATE INDEX login_devices_account_id ON login_devices (account_id);
  `,
  // 既存の行にも値が入るよう、デフォルト値を付けて列を追加する。以降の行には、アプリが値を振る。
  `
  ALTER TABLE sessions ADD COLUMN log_id uuid NOT NULL DEFAULT gen_random_uuid();
  ALTER TABLE sessions ALTER COLUMN log_id DROP DEFAULT;
  `,
];

// 2 人が同時にマイグレーションを実行しても、1 つずつ適用するためのロックの番号。
const MIGRATION_LOCK = 7_316_001;

/**
 * MIGRATIONS のうち、client の DB にまだ適用していないものを、1 つのトランザクションで適用する。
 * client は migrator で接続しておく。戻り値は、適用する前と後のバージョン。
 */
export async function migrate(client: pg.Client): Promise<{ from: number; to: number }> {
  await client.query("BEGIN");
  try {
    await client.query("SELECT pg_advisory_xact_lock($1)", [MIGRATION_LOCK]);
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version integer PRIMARY KEY,
        applied_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    // アプリが読めるのは、起動時にバージョンを確かめるため。書き換えさせない。
    await client.query("REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON schema_migrations FROM app");
    const { rows } = await client.query<{ version: number | null }>(
      "SELECT max(version) AS version FROM schema_migrations",
    );
    const from = rows[0].version ?? 0;
    for (let version = from; version < MIGRATIONS.length; version++) {
      await client.query(MIGRATIONS[version]);
      await client.query("INSERT INTO schema_migrations (version) VALUES ($1)", [version + 1]);
    }
    await client.query("COMMIT");
    return { from, to: Math.max(from, MIGRATIONS.length) };
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  }
}
