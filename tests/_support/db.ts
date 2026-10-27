/**
 * DB を使うテストの部品。接続先の DB は、deno task test が DATABASE_URL を TEST_DATABASE_URL に差し替えて決める。
 */
import { createAccount } from "../../src/lib/auth/accounts.ts";
import type { Account } from "../../src/lib/auth/accounts.ts";
import { db } from "../../src/lib/db.ts";

/**
 * テストで作った行を消す。secrets は消さない（CSRF の鍵はモジュールの読み込み時に読むので、消しても前の鍵が使われ続ける）。
 * 接続先の DB の名前が _test で終わらなければ、例外を投げる。
 * deno task test を通さずに実行したときや、TEST_DATABASE_URL に開発用の DB を書いてしまったときに、
 * 開発用の DB を空にしないため。URL の文字列で比べないのは、書き方が違うだけの同じ DB を見分けられないから。
 */
export async function resetDb(): Promise<void> {
  const { rows: [{ name }] } = await db.query<{ name: string }>(
    "SELECT current_database() AS name",
  );
  if (!name.endsWith("_test")) {
    throw new Error(`DB ${name} は名前が _test で終わらないので、テストでは空にしません`);
  }
  await db.query("TRUNCATE accounts, sessions, login_throttles, login_devices RESTART IDENTITY");
}

export const TEST_PASSWORD = "correct horse battery staple";

/** username のアカウントを、パスワード TEST_PASSWORD・表示名「<username> の表示名」で作って返す。 */
export async function addAccount(username = "alice"): Promise<Account> {
  return await createAccount(username, `${username} の表示名`, TEST_PASSWORD);
}
