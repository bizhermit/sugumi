/**
 * Deno.env を参照するのはこのファイルだけにする。
 * 変数を追加したら deno.json の permissions の default.env.allow と account.env.allow にも追記すること。
 * 本番で設定できるようにするなら、compose.yaml の app の environment と docker/.env.example にも追記すること。
 * ファイルのパスを受け取る変数は、そのファイルの読み込みも permissions で許可すること。
 */
export const PORT = Number(Deno.env.get("PORT") ?? 3000);

export type AppMode = "PROD" | "DEV" | "MOCK";
const APP_MODES: readonly AppMode[] = ["PROD", "DEV", "MOCK"];

/**
 * 起動の仕方ではなく、アプリ自体のモード。既定は PROD。
 * MOCK では src/routes/ の get.mock.ts などを get.ts などの代わりに使う（src/web/router.ts を参照）。
 */
export const APP_MODE: AppMode = appMode();

/**
 * PostgreSQL の接続先（例：postgres://user:password@host:5432/dbname）。パスワードを含むため、ログに出さないこと。
 * パスワードは DATABASE_URL に含めるか、DATABASE_PASSWORD_FILE にファイルのパスを指定する（compose の secrets 用）。
 * ファイルは /run/secrets/ の下に置く。deno.json の permissions で、読み込みをそこだけ許可している。
 * どちらもないと pg が ~/.pgpass を読もうとし、permissions で拒否される。
 * pg は PGSSLMODE など PG で始まる環境変数も読むため、deno.json の permissions で PG* を許可している。
 */
export const DATABASE_URL = databaseUrl();

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

function databaseUrl(): string {
  const raw = required("DATABASE_URL");
  const passwordFile = Deno.env.get("DATABASE_PASSWORD_FILE");
  if (passwordFile === undefined || passwordFile === "") return raw;
  // pg は connectionString を渡すと、別に渡した password を使わないため、URL に埋め込む。
  // URL の password への代入は % をエンコードしないため、先に encodeURIComponent する
  const url = new URL(raw);
  if (url.password !== "") {
    throw new Error("DATABASE_URL と DATABASE_PASSWORD_FILE の両方でパスワードを指定しています");
  }
  // 末尾の改行は、PostgreSQL のイメージがファイルを読むとき（シェルの $(...)）と同じく取り除く
  const password = Deno.readTextFileSync(passwordFile).replace(/\n+$/, "");
  if (password === "") {
    throw new Error(`DATABASE_PASSWORD_FILE のファイルが空です: ${passwordFile}`);
  }
  url.password = encodeURIComponent(password);
  return url.href;
}

function required(name: string): string {
  const value = Deno.env.get(name);
  if (value === undefined || value === "") throw new Error(`環境変数 ${name} を設定してください`);
  return value;
}

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
