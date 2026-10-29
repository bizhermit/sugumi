/**
 * 開発・テストの DB に、docker/db/migrations/ のマイグレーションを docker/db/bin/db-migrate で適用する。
 * 引数に、接続先の URL を入れた環境変数の名前（MIGRATION_DATABASE_URL か TEST_MIGRATION_DATABASE_URL）を渡す。
 */

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
  // パスワードは URL から外し、psql に環境変数 PGPASSWORD で渡す。コマンドの引数は ps などでほかのユーザーからも見えるため。
  const connection = splitPassword(databaseUrl);
  if (connection.status === "invalid") {
    // 値にはパスワードが含まれるので、表示しない。
    console.error(
      `環境変数 ${name} は、postgres://ユーザー:パスワード@ホスト/DB の形の URL で書いてください`,
    );
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
}

/**
 * 接続先の URL を、パスワードを除いた URL と、デコードしたパスワードに分ける。
 * パスワードはユーザー名の後ろに書いたものだけを受け付ける。なければ undefined にする。
 * postgres:// の URL として読めなければ invalid を返す（key=value の形式や複数のホストを書いた URL、
 * パスワードの % の後ろが 16 進数 2 桁でない URL など）。
 * クエリにパスワード（?password=）があっても invalid を返す。URLSearchParams は + を空白に読むが、
 * libpq は + をそのまま読むので、正しく取り出すにはクエリを自前でパースすることになるため。
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
  if (url.searchParams.has("password")) {
    return { status: "invalid" };
  }
  if (url.password === "") {
    return { status: "ok", url: url.href, password: undefined };
  }
  let password: string;
  try {
    password = decodeURIComponent(url.password);
  } catch {
    return { status: "invalid" };
  }
  url.password = "";
  return { status: "ok", url: url.href, password };
}
