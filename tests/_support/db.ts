/**
 * DB を使うテストの部品。DB は deno task test が DATABASE_URL を TEST_DATABASE_URL に差し替えて使わせる。
 */
import { createAccount } from "../../src/lib/auth/accounts.ts";
import type { Account } from "../../src/lib/auth/accounts.ts";
import { db } from "../../src/lib/db.ts";

/**
 * テストで作った行を消す。secrets は消さない（CSRF の鍵は読み込み時に読むため、消しても使われ続ける）。
 * 接続先の DB 名が _test で終わらなければ例外を投げる。
 * deno task test を通さずに起動したときや、TEST_DATABASE_URL に開発用の DB を書いたときに、
 * 開発用の DB を空にしないため。URL の文字列では、書き方の違う同じ DB を見分けられない。
 */
export async function resetDb(): Promise<void> {
  const { rows: [{ name }] } = await db.query<{ name: string }>(
    "SELECT current_database() AS name",
  );
  if (!name.endsWith("_test")) {
    throw new Error(`DB ${name} は名前が _test で終わらないため、テストで空にしません`);
  }
  await db.query("TRUNCATE accounts, sessions, login_throttles, login_devices RESTART IDENTITY");
}

export const TEST_PASSWORD = "correct horse battery staple";

export async function addAccount(username = "alice"): Promise<Account> {
  return await createAccount(username, `${username} の表示名`, TEST_PASSWORD);
}
