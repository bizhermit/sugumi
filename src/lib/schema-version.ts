/**
 * アプリが前提にする DB スキーマのバージョン。docker/db/migrations/ の最後のファイルの番号と同じにする。
 * deno task migrate が、開発用 DB に適用したあとに書き換える。食い違うと deno task build（scripts/check-schema-version.ts）が失敗する。
 *
 * build から DB に接続せずに読めるよう、src/lib/db.ts と分けている。
 */
export const SCHEMA_VERSION = 4;
