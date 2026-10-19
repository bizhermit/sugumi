/**
 * Deno.env を参照するのはこのファイルだけにする。
 * 変数を追加したら deno.json の permissions の default.env と account.env にも追記すること。
 */
export const PORT = Number(Deno.env.get("PORT") ?? 3000);

export type AppMode = "PROD" | "DEV" | "MOCK";
const APP_MODES: readonly AppMode[] = ["PROD", "DEV", "MOCK"];

/**
 * 起動の仕方ではなく、アプリ自体のモード。既定は PROD。
 * MOCK では src/routes/ の get.mock.ts などを get.ts などの代わりに使う（src/web/router.ts を参照）。
 */
export const APP_MODE: AppMode = appMode();

/** ログインに続けて失敗してロックしたアカウントを、自動で解除するまでの分数。 */
export const LOGIN_LOCKOUT_MINUTES = integer("LOGIN_LOCKOUT_MINUTES", 60, 1);

/** ログインに続けてこの回数だけ失敗するとロックする。0 ならロックしない。 */
export const LOGIN_MAX_FAILED_ATTEMPTS = integer("LOGIN_MAX_FAILED_ATTEMPTS", 5, 0);

/** ログイン中に操作がないまま、この分数が経つとセッションが切れる。0 なら切れない。 */
export const SESSION_IDLE_TIMEOUT_MINUTES = integer("SESSION_IDLE_TIMEOUT_MINUTES", 30, 0);

/** 操作を続けていても、ログインからこの分数が経つとセッションが切れる。0 なら切れない。 */
export const SESSION_ABSOLUTE_TIMEOUT_MINUTES = integer("SESSION_ABSOLUTE_TIMEOUT_MINUTES", 720, 0);

/** ログイン前に表示したフォーム（ログイン画面など）の CSRF トークンが有効な分数。0 なら切れない。 */
export const PRE_LOGIN_CSRF_TIMEOUT_MINUTES = integer("PRE_LOGIN_CSRF_TIMEOUT_MINUTES", 60, 0);

function integer(name: string, fallback: number, min: number): number {
  const raw = Deno.env.get(name);
  if (raw === undefined || raw === "") return fallback;
  const value = Number(raw);
  if (!/^\d+$/.test(raw) || !Number.isSafeInteger(value) || value < min) {
    throw new Error(`環境変数 ${name} は ${min} 以上の整数にしてください: ${raw}`);
  }
  return value;
}

function appMode(): AppMode {
  const raw = Deno.env.get("APP_MODE");
  if (raw === undefined || raw === "") return "PROD";
  const mode = APP_MODES.find((m) => m === raw);
  if (!mode) {
    throw new Error(`環境変数 APP_MODE は ${APP_MODES.join("・")} のどれかにしてください: ${raw}`);
  }
  return mode;
}
