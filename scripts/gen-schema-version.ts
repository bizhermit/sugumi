/**
 * docker/db/migrations/ の最後のマイグレーションの番号を、src/lib/schema-version.gen.ts の SCHEMA_VERSION に書き出す。
 * `--check` を付けると、書き出さずに食い違いだけを確かめる。deno task build が実行し、生成し忘れたイメージを作らせない。
 *
 * ファイル名と番号の並びは、本番で適用する docker/db/bin/db-migrate の --check で確かめる。
 * 規則を 2 か所に書くと、こちらは通るのに本番の適用で失敗する、という食い違いが起きるため。
 */
const MIGRATIONS_DIR = new URL("../docker/db/migrations/", import.meta.url);
const OUT = new URL("../src/lib/schema-version.gen.ts", import.meta.url);
const DB_MIGRATE = new URL("../docker/db/bin/db-migrate", import.meta.url);
const VERSION_OUTPUT = /^(\d+)\n$/;

if (import.meta.main) {
  const result = await readMigrationVersion(MIGRATIONS_DIR);
  if (result.status === "invalid") {
    // 理由は db-migrate が標準エラーに出している。
    Deno.exit(1);
  }
  if (!Deno.args.includes("--check")) {
    await writeSchemaVersion(result.version, OUT);
  } else if (!(await isSchemaVersionCurrent(result.version, OUT))) {
    console.error(
      `src/lib/schema-version.gen.ts が docker/db/migrations/ と食い違っています。deno task gen を実行してください: マイグレーション ${result.version}`,
    );
    Deno.exit(1);
  }
}

// テストからは呼ばない。テストの権限に sh の実行を許すと、deno.json の permissions の制限を越えられるため。
// ファイル名の確認は、CI の deno task gen と deno task build が、リポジトリのマイグレーションで行う。
async function readMigrationVersion(
  migrations: URL,
): Promise<{ status: "ok"; version: number } | { status: "invalid" }> {
  const { code, stdout } = await new Deno.Command("sh", {
    args: [decodeURIComponent(DB_MIGRATE.pathname), "--check"],
    env: { MIGRATIONS_DIR: decodeURIComponent(migrations.pathname) },
    stderr: "inherit",
  }).output();
  if (code !== 0) {
    return { status: "invalid" };
  }
  const output = new TextDecoder().decode(stdout);
  const match = VERSION_OUTPUT.exec(output);
  if (match === null) {
    throw new Error(`db-migrate --check の出力が番号ではありません: ${JSON.stringify(output)}`);
  }
  return { status: "ok", version: Number(match[1]) };
}

function schemaVersionSource(version: number) {
  return `// deno task gen で docker/db/migrations/ から生成する。直接編集しないこと。

/** アプリが前提にする DB スキーマのバージョン。DB のバージョンと違えば、アプリは起動しない（src/lib/db.ts）。 */
export const SCHEMA_VERSION = ${version};
`;
}

/**
 * SCHEMA_VERSION を version にしたファイルを out に書き出す。
 * テストでは out に別の場所を渡す。
 */
export async function writeSchemaVersion(version: number, out: URL): Promise<void> {
  const content = schemaVersionSource(version);
  const current = await Deno.readTextFile(out).catch(() => undefined);
  // 監視しているツールが無駄に反応しないよう、内容が同じなら書き込まない。
  if (content !== current) {
    await Deno.writeTextFile(out, content);
  }
}

/**
 * out が、SCHEMA_VERSION を version にして生成したものと同じなら true を返す。ファイルがなければ false を返す。
 * テストでは out に別の場所を渡す。
 */
export async function isSchemaVersionCurrent(version: number, out: URL): Promise<boolean> {
  const current = await Deno.readTextFile(out).catch(() => undefined);
  return current === schemaVersionSource(version);
}
