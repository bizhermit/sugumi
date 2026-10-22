/**
 * スキーマを変えるときは MIGRATIONS の末尾に追加し、適用済みの要素は書き換えないこと。
 * どこまで適用したかは schema_migrations テーブルに記録している。
 *
 * 問い合わせの値は必ずパラメータ（$1 など）で渡す。SQL の文字列に値を連結しない。
 * 別のリクエストの処理は await のたびに割り込み、アプリは複数のインスタンスで動くこともある。
 * 読んだ値をもとに書き込むときは、transaction() と SELECT ... FOR UPDATE などで守ること。
 */
// @ts-types="npm:@types/pg@8.23.1"
import pg from "pg";
import {
  DATABASE_URL,
  DB_CONNECTION_TIMEOUT_SECONDS,
  DB_POOL_MAX,
  DB_STATEMENT_TIMEOUT_SECONDS,
} from "./env.ts";

const MIGRATIONS = [
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
];

// 複数のインスタンスが同時に起動しても、マイグレーションを 1 つずつ適用するためのロックの番号
const MIGRATION_LOCK = 7_316_001;

// query_timeout（クライアント側の時間制限）は使わない。送信済みの文が切れても接続は応答を待ったまま Pool に戻り、
// 次にその接続を使う問い合わせが後ろで待たされるため。statement_timeout なら DB が文を取り消し、接続はそのまま使える
export const db = new pg.Pool({
  connectionString: DATABASE_URL,
  max: DB_POOL_MAX,
  connectionTimeoutMillis: DB_CONNECTION_TIMEOUT_SECONDS * 1000,
  statement_timeout: DB_STATEMENT_TIMEOUT_SECONDS * 1000,
});
// 待機中の接続が切れると Pool が error を出す。リスナーがないとプロセスが終了する
db.on("error", (e) => console.error(e));

await migrate();

/**
 * fn の中の問い合わせを 1 つのトランザクションで実行する。fn が例外を投げたら ROLLBACK し、例外を投げ直す。
 * fn の中では db ではなく引数の client を使うこと。db を使うと別の接続になり、トランザクションの外で実行される。
 */
export async function transaction<T>(fn: (client: pg.PoolClient) => Promise<T>): Promise<T> {
  const client = await db.connect();
  let broken = false;
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (e) {
    try {
      await client.query("ROLLBACK");
    } catch {
      // ROLLBACK できない接続は状態が分からないため、Pool に戻さず捨てる
      broken = true;
    }
    throw e;
  } finally {
    client.release(broken);
  }
}

/**
 * e が、接続の空きを待ちきれなかったか、問い合わせが statement_timeout で取り消された例外なら true を返す。
 * pg-pool は待ちの時間切れを専用の型やコードのない Error で知らせるため、メッセージで見分ける。
 * pg を更新してメッセージが変わったら、tests/lib/db_test.ts・tests/web/app_test.ts が失敗する。
 */
export function isDbTimeout(e: unknown): boolean {
  if (!(e instanceof Error)) return false;
  // 57014 は query_canceled。statement_timeout のほか、管理者が pg_cancel_backend() で止めたときも含む
  if ((e as { code?: unknown }).code === "57014") return true;
  return e.message === "timeout exceeded when trying to connect" ||
    e.message === "Connection terminated due to connection timeout";
}

/** name の秘密の値を返す。まだなければ bytes バイトのランダムな値を作って保存する。 */
export async function secret(name: string, bytes: number): Promise<Uint8Array<ArrayBuffer>> {
  await db.query(
    "INSERT INTO secrets (name, value) VALUES ($1, $2) ON CONFLICT (name) DO NOTHING",
    [name, crypto.getRandomValues(new Uint8Array(bytes))],
  );
  const { rows } = await db.query<{ value: Uint8Array }>(
    "SELECT value FROM secrets WHERE name = $1",
    [name],
  );
  return new Uint8Array(rows[0].value);
}

async function migrate(): Promise<void> {
  await transaction(async (client) => {
    // 大きなテーブルの変更や、ほかのインスタンスのマイグレーションの終わりを待つ時間は、リクエストの時間制限では測れない
    await client.query("SET LOCAL statement_timeout = 0");
    await client.query("SELECT pg_advisory_xact_lock($1)", [MIGRATION_LOCK]);
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version integer PRIMARY KEY,
        applied_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    const { rows } = await client.query<{ version: number | null }>(
      "SELECT max(version) AS version FROM schema_migrations",
    );
    for (let version = rows[0].version ?? 0; version < MIGRATIONS.length; version++) {
      await client.query(MIGRATIONS[version]);
      await client.query("INSERT INTO schema_migrations (version) VALUES ($1)", [version + 1]);
    }
  });
}
