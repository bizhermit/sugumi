/**
 * 開発・テストの DB に、docker/db/migrations/ のマイグレーションを docker/db/bin/db-migrate で適用する。
 * 引数に、接続先の URL を入れた環境変数の名前（MIGRATION_DATABASE_URL か TEST_MIGRATION_DATABASE_URL）を渡す。
 *
 * 開発用 DB（MIGRATION_DATABASE_URL）に適用したら、src/lib/schema-version.ts の SCHEMA_VERSION を最後の番号に揃える。
 */
import { lastMigrationVersion } from "./check-schema-version.ts";

const SCHEMA_VERSION_DECLARATION = /export const SCHEMA_VERSION = \d+;/;

if (import.meta.main) {
  const name = Deno.args[0];
  if (name !== "MIGRATION_DATABASE_URL" && name !== "TEST_MIGRATION_DATABASE_URL") {
    console.error("引数に MIGRATION_DATABASE_URL か TEST_MIGRATION_DATABASE_URL を渡してください");
    Deno.exit(1);
  }
  const databaseUrl = Deno.env.get(name);
  if (databaseUrl === undefined || databaseUrl === "") {
    console.error(`環境変数 ${name} を設定してください`);
    Deno.exit(1);
  }
  // パスワードは URL から外し、psql に環境変数 PGPASSWORD で渡す。コマンドの引数は ps などでほかのユーザーからも見えるため
  const connection = splitPassword(databaseUrl);
  if (connection.status === "invalid") {
    // 値にはパスワードが含まれるので、表示しない
    console.error(`環境変数 ${name} は、postgres:// で始まる URL で書いてください`);
    Deno.exit(1);
  }
  const env: Record<string, string> = { MIGRATIONS_DIR: "docker/db/migrations" };
  if (connection.password !== undefined) {
    env.PGPASSWORD = connection.password;
  }
  const { code } = await new Deno.Command("sh", {
    args: ["docker/db/bin/db-migrate", connection.url],
    env,
  }).spawn().status;
  if (code !== 0) {
    Deno.exit(code);
  }
  // テスト用 DB（migrate:test）では書き換えない。CI で書き換えると、上げ忘れに気づけないため
  if (name === "MIGRATION_DATABASE_URL") {
    const version = await updateSchemaVersion(new URL("../", import.meta.url));
    if (version !== undefined) {
      console.log(`src/lib/schema-version.ts の SCHEMA_VERSION を ${version} にしました`);
    }
  }
}

/**
 * 接続先の URL を、パスワードを除いた URL と、デコードしたパスワードに分ける。
 * パスワードは、ユーザー名の後ろとクエリ（?password=）のどちらに書いてあっても外す。なければ undefined にする。
 * postgres:// の URL として読めなければ invalid を返す（key=value の形式や、複数のホストを書いた URL など）。
 */
export function splitPassword(
  databaseUrl: string,
): { status: "ok"; url: string; password: string | undefined } | { status: "invalid" } {
  if (!URL.canParse(databaseUrl)) {
    return { status: "invalid" };
  }
  const url = new URL(databaseUrl);
  if (url.protocol !== "postgres:" && url.protocol !== "postgresql:") {
    return { status: "invalid" };
  }
  let password = url.password === "" ? undefined : decodeURIComponent(url.password);
  url.password = "";
  const queryPassword = url.searchParams.get("password");
  if (queryPassword !== null) {
    password = queryPassword;
    url.searchParams.delete("password");
  }
  return { status: "ok", url: url.href, password };
}

/**
 * root（リポジトリのルート）の src/lib/schema-version.ts の SCHEMA_VERSION を、最後のマイグレーションの番号に書き換える。
 * 書き換えたら新しい番号を、同じだったら undefined を返す。
 */
export async function updateSchemaVersion(root: URL): Promise<number | undefined> {
  const file = new URL("src/lib/schema-version.ts", root);
  const source = await Deno.readTextFile(file);
  if (!SCHEMA_VERSION_DECLARATION.test(source)) {
    throw new Error(`SCHEMA_VERSION の宣言が見つかりません: ${file.pathname}`);
  }
  const version = await lastMigrationVersion(root);
  const updated = source.replace(
    SCHEMA_VERSION_DECLARATION,
    `export const SCHEMA_VERSION = ${version};`,
  );
  // 同じ内容でも書き込むと、deno task dev がファイルの変更として起動し直すので、書かない
  if (updated === source) return undefined;
  await Deno.writeTextFile(file, updated);
  return version;
}
