/**
 * ロックしたアカウントを解除する。id は監査ログの accountId。
 *
 *   deno task account:unlock <アカウントの id>
 */
import { unlockAccount } from "../src/lib/auth/accounts.ts";
import { db } from "../src/lib/db.ts";

const [raw] = Deno.args;
// DB の integer の範囲を超えると、問い合わせが分かりにくいエラーになるため、先に断る
if (raw === undefined || !/^\d+$/.test(raw) || Number(raw) > 2 ** 31 - 1) {
  console.error("使い方: deno task account:unlock <アカウントの id>");
  Deno.exit(1);
}
const account = await unlockAccount(Number(raw));
// 接続を閉じないと、Pool が接続を持ったままプロセスが終わらない
await db.end();
if (!account) {
  console.error(`id ${raw} のアカウントはありません`);
  Deno.exit(1);
}
console.log(`${account.username}（id: ${account.id}）のロックを解除しました`);
