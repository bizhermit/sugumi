/**
 * アカウントを追加する。パスワードは画面に表示せずに入力させるため、端末から実行すること。
 *
 *   deno task account:add <ユーザー名> <表示名>
 */
import { createAccount } from "../src/lib/auth/accounts.ts";
import { db } from "../src/lib/db.ts";

const [username, displayName] = Deno.args;
if (username === undefined || displayName === undefined) {
  console.error("使い方: deno task account:add <ユーザー名> <表示名>");
  Deno.exit(1);
}
if (!Deno.stdin.isTerminal()) {
  console.error("パスワードを入力するため、端末から実行してください");
  Deno.exit(1);
}

const password = await readHidden("パスワード: ");
if (password !== await readHidden("パスワード（確認）: ")) {
  console.error("パスワードが一致しません");
  Deno.exit(1);
}
try {
  const account = await createAccount(username, displayName, password);
  console.log(`追加しました（id: ${account.id}）`);
  // 接続を閉じないと、Pool が接続を持ったままプロセスが終わらない
  await db.end();
} catch (e) {
  console.error(e instanceof Error ? e.message : e);
  Deno.exit(1);
}

async function readHidden(label: string): Promise<string> {
  await Deno.stdout.write(new TextEncoder().encode(label));
  const bytes: number[] = [];
  const buf = new Uint8Array(1);
  Deno.stdin.setRaw(true);
  try {
    while ((await Deno.stdin.read(buf)) !== null) {
      const b = buf[0];
      if (b === 0x03) {
        Deno.stdin.setRaw(false);
        await Deno.stdout.write(new TextEncoder().encode("\n"));
        Deno.exit(130);
      }
      if (b === 0x0d || b === 0x0a) break;
      if (b === 0x7f || b === 0x08) {
        // UTF-8 の継続バイト（10xxxxxx）ごと消し、1 文字分を戻す
        while (bytes.length > 0 && (bytes.pop()! & 0xc0) === 0x80);
        continue;
      }
      bytes.push(b);
    }
  } finally {
    Deno.stdin.setRaw(false);
    await Deno.stdout.write(new TextEncoder().encode("\n"));
  }
  return new TextDecoder().decode(new Uint8Array(bytes));
}
