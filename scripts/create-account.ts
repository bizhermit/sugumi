/**
 * アカウントを作成する。
 *   node scripts/create-account.ts <ユーザー名> <表示名>
 * パスワードは標準入力から読む（画面に表示されるので、人に見られない場所で実行する）。
 */
import { createInterface } from "node:readline/promises";
import { createAccount, USERNAME_MAX_LENGTH } from "../src/features/auth/accounts.ts";
import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from "../src/features/auth/password.ts";
import { loadConfig } from "../src/lib/config.ts";
import { createDb } from "../src/lib/db.ts";
import { createLogger } from "../src/lib/logger.ts";

const [username, displayName] = process.argv.slice(2);
if (username == null || displayName == null) {
  console.error("使い方: node scripts/create-account.ts <ユーザー名> <表示名>");
  process.exit(1);
}
if (username.length === 0 || username.length > USERNAME_MAX_LENGTH) {
  console.error(`ユーザー名は1〜${USERNAME_MAX_LENGTH}文字以内で入力してください。`);
  process.exit(1);
}
if (displayName.length === 0) {
  console.error("表示名を指定してください。");
  process.exit(1);
}

const rl = createInterface({ input: process.stdin, output: process.stdout });
const password = await rl.question("パスワード: ");
rl.close();
if (password.length < PASSWORD_MIN_LENGTH || password.length > PASSWORD_MAX_LENGTH) {
  console.error(`パスワードは${PASSWORD_MIN_LENGTH}〜${PASSWORD_MAX_LENGTH}文字で入力してください。`);
  process.exit(1);
}

const config = loadConfig();
const db = createDb(config.databaseUrl, createLogger(config.log));
try {
  const id = await createAccount(db, username, displayName, password);
  console.log(`アカウントを作成しました: id=${id} username=${username}`);
} finally {
  await db.end();
}
