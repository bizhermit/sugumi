/**
 * アカウントを追加する。パスワードは画面に表示せずに入力するので、端末から実行すること。
 *
 *   deno task account:add <ユーザー名> <表示名>
 */
import { createAccount, USERNAME_MAX_LENGTH } from "../src/lib/auth/accounts.ts";
import type { CreateAccountResult } from "../src/lib/auth/accounts.ts";
import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from "../src/lib/auth/password.ts";
import { db } from "../src/lib/db.ts";

const [username, displayName] = Deno.args;
if (username === undefined || displayName === undefined) {
  console.error("使い方: deno task account:add <ユーザー名> <表示名>");
  Deno.exit(1);
}
if (!Deno.stdin.isTerminal()) {
  console.error("パスワードを入力するので、端末から実行してください");
  Deno.exit(1);
}

const password = await readHidden("パスワード: ");
if (password !== await readHidden("パスワード（確認）: ")) {
  console.error("パスワードが一致しません");
  Deno.exit(1);
}
try {
  const result = await createAccount(username, displayName, password);
  if (result.status !== "ok") {
    console.error(failureMessage(result.status, username));
    Deno.exit(1);
  }
  console.log(`追加しました（id: ${result.account.id}）`);
  // 接続を閉じないと、Pool が接続を持ったままになり、プロセスが終わらない。
  await db.end();
} catch (e) {
  console.error(e instanceof Error ? e.message : e);
  Deno.exit(1);
}

function failureMessage(status: Exclude<CreateAccountResult["status"], "ok">, username: string) {
  switch (status) {
    case "invalid_username":
      return `ユーザー名は空白を含まない ${USERNAME_MAX_LENGTH} 文字以内にしてください`;
    case "invalid_display_name":
      return "表示名を入力してください";
    case "invalid_password":
      return `パスワードは ${PASSWORD_MIN_LENGTH} 文字以上 ${PASSWORD_MAX_LENGTH} 文字以内にしてください`;
    case "username_taken":
      return `ユーザー名 ${username} はすでに使われています`;
  }
}

async function readHidden(label: string) {
  await Deno.stdout.write(new TextEncoder().encode(label));
  const bytes: Array<number> = [];
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
        // 1 文字分を消す。UTF-8 の継続バイト（10xxxxxx）もまとめて消す。
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
