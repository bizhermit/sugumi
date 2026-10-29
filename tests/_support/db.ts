/**
 * DB を使うテストの部品。接続先の DB は、deno task test が DATABASE_URL を TEST_DATABASE_URL に差し替えて決める。
 */
import { createAccount } from "../../src/lib/auth/accounts.ts";
import type { Account } from "../../src/lib/auth/accounts.ts";
import { db } from "../../src/lib/db.ts";

// テスト用の DB に、管理者が COMMENT ON DATABASE で付ける印。
// .devcontainer/db-test/disposable.sql と .github/workflows/ci.yml が付ける。
const DISPOSABLE_COMMENT = "disposable";

/**
 * テストで作った行を消す。secrets は消さない（CSRF の鍵はモジュールの読み込み時に読むので、消しても前の鍵が使われ続ける）。
 * 接続先の DB のコメントが disposable（使い捨て）でなければ、例外を投げる。
 * deno task test を通さずに実行したときや、TEST_DATABASE_URL に開発用・本番の DB を書いてしまったときに、空にしないため。
 * URL の文字列で比べないのは、書き方が違うだけの同じ DB を見分けられないから。
 * 名前ではなくコメントで見分けるのは、テスト用の DB も本番と同じ名前（app）にするため。
 * コメントを付けられるのは DB の持ち主か管理者だけで、app は付けられない。
 */
export async function resetDb(): Promise<void> {
  const { rows: [{ name, comment }] } = await db.query<{ name: string; comment: string | null }>(
    "SELECT datname AS name, shobj_description(oid, 'pg_database') AS comment" +
      " FROM pg_database WHERE datname = current_database()",
  );
  if (comment !== DISPOSABLE_COMMENT) {
    throw new Error(
      `DB ${name} は使い捨ての DB の印（COMMENT ON DATABASE ... IS '${DISPOSABLE_COMMENT}'）がないので、テストでは空にしません`,
    );
  }
  // アプリと同じ DB ユーザー app で接続しているので、TRUNCATE はできない（テーブルの読み書きだけを許している）。
  // sessions・login_devices は、accounts の行を消すと一緒に消える。
  await db.query("DELETE FROM accounts; DELETE FROM login_throttles");
}

export const TEST_PASSWORD = "correct horse battery staple";

/**
 * username のアカウントを、パスワード TEST_PASSWORD・表示名「<username> の表示名」で作って返す。
 * 作れなければ例外を投げる。
 */
export async function addAccount(username = "alice"): Promise<Account> {
  const result = await createAccount(username, `${username} の表示名`, TEST_PASSWORD);
  if (result.status !== "ok") {
    throw new Error(`アカウント ${username} を作れませんでした: ${result.status}`);
  }
  return result.account;
}
