// deno task gen で docker/db/migrations/ から生成する。直接編集しないこと。

/** アプリが前提にする DB スキーマのバージョン。DB のバージョンと違えば、アプリは起動しない（src/lib/db.ts）。 */
export const SCHEMA_VERSION = 4;
