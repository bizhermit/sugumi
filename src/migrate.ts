/**
 * DB にマイグレーション（src/lib/migrations.ts）を適用する。アプリを起動する前に実行する。
 * DATABASE_URL・DATABASE_PASSWORD_FILE には、アプリの app ではなく、スキーマを持つ DB ユーザー migrator の接続先を渡す。
 * 開発環境とテストでは deno task migrate・test が、本番では compose.yaml の migrate サービスが渡す。
 */
// @ts-types="npm:@types/pg@8.23.1"
import pg from "pg";
import { DATABASE_URL } from "./lib/env.ts";
import { migrate } from "./lib/migrations.ts";

const client = new pg.Client({ connectionString: DATABASE_URL });
await client.connect();
try {
  const { from, to } = await migrate(client);
  console.log(
    from === to
      ? `適用するマイグレーションはありません: ${to}`
      : `マイグレーションを適用しました: ${from} → ${to}`,
  );
} finally {
  await client.end();
}
