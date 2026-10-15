/**
 * Deno.env を参照するのはこのファイルだけにする。
 * 変数を追加したら deno.json の permissions の default.env と account.env にも追記すること。
 */
export const PORT = Number(Deno.env.get("PORT") ?? 3000);

/** ログインに続けて失敗してロックしたアカウントを、自動で解除するまでの分数。 */
export const LOGIN_LOCKOUT_MINUTES = integer("LOGIN_LOCKOUT_MINUTES", 60, 1);

/** ログインに続けてこの回数だけ失敗するとロックする。0 ならロックしない。 */
export const LOGIN_MAX_FAILED_ATTEMPTS = integer("LOGIN_MAX_FAILED_ATTEMPTS", 5, 0);

function integer(name: string, fallback: number, min: number): number {
  const raw = Deno.env.get(name);
  if (raw === undefined || raw === "") return fallback;
  const value = Number(raw);
  if (!/^\d+$/.test(raw) || !Number.isSafeInteger(value) || value < min) {
    throw new Error(`環境変数 ${name} は ${min} 以上の整数にしてください: ${raw}`);
  }
  return value;
}
