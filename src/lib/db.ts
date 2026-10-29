/**
 * アプリの DB の接続。DB ユーザー app で接続し、テーブルの読み書きだけができる。
 * スキーマの変更（マイグレーション）は、アプリとは別に docker/db/migrations/ の SQL を db-migrate で適用する。
 *
 * クエリの値は必ずパラメータ（$1 など）で渡す。SQL の文字列に値を連結しない。
 * await のたびに別のリクエストの処理が割り込み、アプリが複数のインスタンスで動くこともある。
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
import { logError } from "./log.ts";
import { SCHEMA_VERSION } from "./schema-version.gen.ts";

// query_timeout（クライアント側のタイムアウト）は使わない。タイムアウトしても、接続は送信済みの文のレスポンスを待ったまま Pool に戻り、
// 次にその接続を使うクエリが後ろで待たされるため。statement_timeout なら DB が文を取り消すので、接続はそのまま使える。
export const db = new pg.Pool({
  connectionString: DATABASE_URL,
  max: DB_POOL_MAX,
  connectionTimeoutMillis: DB_CONNECTION_TIMEOUT_SECONDS * 1000,
  statement_timeout: DB_STATEMENT_TIMEOUT_SECONDS * 1000,
});
// 待機中の接続が切れると、Pool が error イベントを出す。リスナーがないと、プロセスが終了してしまう。
// リスナーには第 2 引数として接続が渡されるので、logError() をそのまま渡さない。
db.on("error", (e) => logError(e));

await checkSchemaVersion();

/**
 * fn の中のクエリを 1 つのトランザクションで実行し、fn の戻り値を返す。fn が例外を投げたら ROLLBACK し、例外を投げ直す。
 * fn の中では、db ではなく引数の client を使うこと。db を使うと別の接続になり、トランザクションの外で実行される。
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
      // ROLLBACK できない接続は状態が分からないので、Pool に戻さずに捨てる。
      broken = true;
    }
    throw e;
  } finally {
    client.release(broken);
  }
}

/**
 * e が、空いた接続を待ちきれなかったときか、クエリが statement_timeout で取り消されたときの例外なら true を返す。
 * pg-pool は、待ち時間のタイムアウトを、専用の型やコードのない Error で知らせる。そのため、メッセージで見分ける。
 * pg を更新してメッセージが変わったら、tests/lib/db_test.ts・tests/web/app_test.ts が失敗する。
 */
export function isDbTimeout(e: unknown): boolean {
  if (!(e instanceof Error)) return false;
  // 57014 は query_canceled。statement_timeout のほか、管理者が pg_cancel_backend() で止めたときにも出る。
  if ((e as { code?: unknown }).code === "57014") return true;
  return e.message === "timeout exceeded when trying to connect" ||
    e.message === "Connection terminated due to connection timeout";
}

/**
 * name の秘密の値（署名の鍵など）を返す。まだなければ、bytes バイトのランダムな値を作って保存する。
 * DB に置くので、複数のインスタンスで同じ値を使え、再起動しても変わらない。
 */
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

// アプリはマイグレーションを適用せず、バージョンを突き合わせるだけにする。
// 実行を忘れたまま、またはアプリより新しい DB で動くと、テーブルや列がずれたまま書き込んでしまうので、起動させない。
async function checkSchemaVersion() {
  let version: number;
  try {
    const { rows } = await db.query<{ version: number | null }>(
      "SELECT max(version) AS version FROM schema_migrations",
    );
    version = rows[0].version ?? 0;
  } catch (e) {
    // 42P01 は undefined_table。一度もマイグレーションを実行していない DB。
    if (!(e instanceof Error) || (e as { code?: unknown }).code !== "42P01") throw e;
    version = 0;
  }
  if (version !== SCHEMA_VERSION) {
    throw new Error(
      `DB のスキーマのバージョンがアプリと合いません。マイグレーションを実行してください: DB ${version}、アプリ ${SCHEMA_VERSION}`,
    );
  }
}
