/**
 * アカウントを作成する。
 *   node scripts/create-account.ts <ユーザー名> <表示名>
 * パスワードは標準入力から読む（画面に表示されるため、人に見られない場所で実行する）。
 */
import { createInterface } from "node:readline/promises";
import { displayName, newPassword, username } from "../src/features/auth/_shared/account.ts";
import { createAccount } from "../src/features/auth/accounts.ts";
import { loadConfig } from "../src/lib/config.ts";
import { createDb } from "../src/lib/db.ts";
import { createLogger } from "../src/lib/logger.ts";
import { formatIssue, jaFormMessages, type Schema } from "../src/lib/_shared/schema/index.ts";

function parseOrExit<T>(schema: Schema<T>, input: string | undefined): T {
  const result = schema.safeParse(input);
  if (!result.success) {
    console.error(result.error.issues.map((issue) => formatIssue(issue, jaFormMessages)).join("\n"));
    process.exit(1);
  }
  return result.data;
}

if (process.argv.length < 4) {
  console.error("使い方: node scripts/create-account.ts <ユーザー名> <表示名>");
  process.exit(1);
}
const name = parseOrExit(username, process.argv[2]);
const display = parseOrExit(displayName, process.argv[3]);

const rl = createInterface({ input: process.stdin, output: process.stdout });
const entered = await rl.question("パスワード: ");
rl.close();
const pw = parseOrExit(newPassword, entered);

const config = loadConfig();
const db = createDb(config.databaseUrl, createLogger(config.log));
try {
  const id = await createAccount(db, name, display, pw);
  console.log(`アカウントを作成しました: id=${id} username=${name}`);
} finally {
  await db.end();
}
