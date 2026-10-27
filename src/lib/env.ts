/**
 * Deno.env を参照するのはこのファイルだけにする（tests/ と、テストを起動する scripts/test-e2e.ts を除く）。
 * 変数を追加したら deno.json の permissions の default・account・test・test-e2e の env.allow にも追記すること。
 * 本番で設定できるようにするなら、compose.yaml の app の environment、docker/.env.example、docker/README.md にも追記すること。
 * ファイルのパスを受け取る変数は、そのファイルの読み込みも permissions で許可すること。
 *
 * 検証は parse で始まる関数に分け、値を引数で受け取る。環境変数を変えずにテストで確かめられるようにするため。
 */
import { type Cidr, parseCidr, parseIp } from "./ip.ts";

export type AppMode = "PROD" | "DEV" | "MOCK";
const APP_MODES: readonly AppMode[] = ["PROD", "DEV", "MOCK"];

/**
 * 起動の仕方ではなく、アプリ自体のモード。既定は PROD。
 * MOCK では src/routes/ の get.mock.ts などを get.ts などの代わりに使う（src/web/router.ts を参照）。
 */
export const APP_MODE: AppMode = parseAppMode(Deno.env.get("APP_MODE"));

export const PORT = Number(Deno.env.get("PORT") ?? 3000);

/**
 * 待ち受けるアドレス。既定は 0.0.0.0 で、コンテナの外（compose.yaml の ports）から届くようにする。
 * deno task test:e2e は、テストの間だけ LAN から届かないよう 127.0.0.1 にする（scripts/test-e2e.ts）。
 */
export const LISTEN_HOST = parseListenHost(Deno.env.get("LISTEN_HOST"));

/**
 * 信頼するリバースプロキシ・ロードバランサーの IP アドレス。カンマ区切り（例：192.0.2.10）。
 * ロードバランサーのようにアドレスが変わるものは、CIDR（例：10.0.1.0/24）で書ける。
 * TCP の接続元がこのどれかのときだけ、X-Forwarded-For から利用者のアドレスを読む（src/web/remote-address.ts）。
 * 未指定なら X-Forwarded-For を読まない。
 * 範囲の中の端末は、X-Forwarded-For を書いて送れば、プロキシを通しても通さなくても接続元を偽れる。
 * そのため、プロキシのアドレスだけを最小の範囲で書く。
 */
export const TRUSTED_PROXIES: readonly Cidr[] = parseTrustedProxies(
  Deno.env.get("TRUSTED_PROXIES"),
);

/**
 * リクエストの本文を読み終えるまでの秒数。過ぎたら 408 を返す。
 * 本文はログインや CSRF の確認より前に読むため、上限がないと、誰でも本文を少しずつ送る接続で
 * 1 接続あたり最大 1 MB を抱えさせ続けられる（slowloris）。
 */
export const REQUEST_BODY_TIMEOUT_SECONDS = integer("REQUEST_BODY_TIMEOUT_SECONDS", 30, 1);

/** ログイン中に操作がないまま、この分数が経つとセッションが切れる。0 なら切れない。 */
export const SESSION_IDLE_TIMEOUT_MINUTES = integer("SESSION_IDLE_TIMEOUT_MINUTES", 30, 0);

/** 操作を続けていても、ログインからこの分数が経つとセッションが切れる。0 なら切れない。 */
export const SESSION_ABSOLUTE_TIMEOUT_MINUTES = integer("SESSION_ABSOLUTE_TIMEOUT_MINUTES", 720, 0);

/** ログインに続けて失敗してロックしたアカウントを、自動で解除するまでの分数。 */
export const LOGIN_LOCKOUT_MINUTES = integer("LOGIN_LOCKOUT_MINUTES", 60, 1);

/**
 * ログインに続けてこの回数だけ失敗するとロックする。0 ならロックしない。
 * ログインしたことのある端末からは、端末ごとにこの回数まで試せる（LOGIN_DEVICE_DAYS を参照）。
 */
export const LOGIN_MAX_FAILED_ATTEMPTS = integer("LOGIN_MAX_FAILED_ATTEMPTS", 5, 0);

/**
 * ログインに成功した端末を覚えておく日数。成功するたびに延びる。
 * 覚えている端末からは、アカウントのロックと接続元ごとの制限を受けずにログインできる。
 */
export const LOGIN_DEVICE_DAYS = integer("LOGIN_DEVICE_DAYS", 90, 1);

/**
 * 同じ接続元から LOGIN_IP_WINDOW_MINUTES の間にこの回数だけログインに失敗すると、それ以降はその接続元からのログインを受け付けない。
 * 0 なら制限しない。アカウントを問わずに数えるため、多数のアカウントに少しずつ試す攻撃も遅らせられる。
 * NAT の裏の利用者は同じ接続元として数えるため、利用者の数に合わせて余裕を持たせる。
 */
export const LOGIN_IP_MAX_FAILED_ATTEMPTS = integer("LOGIN_IP_MAX_FAILED_ATTEMPTS", 20, 0);

/** LOGIN_IP_MAX_FAILED_ATTEMPTS の回数を数える時間の分数。最初の失敗から数え始める。 */
export const LOGIN_IP_WINDOW_MINUTES = integer("LOGIN_IP_WINDOW_MINUTES", 10, 1);

/** LOGIN_IP_MAX_FAILED_ATTEMPTS を超えた接続元からのログインを受け付けない分数。 */
export const LOGIN_IP_LOCKOUT_MINUTES = integer("LOGIN_IP_LOCKOUT_MINUTES", 30, 1);

/** ログイン前に表示したフォーム（ログイン画面など）の CSRF トークンが有効な分数。0 なら切れない。 */
export const PRE_LOGIN_CSRF_TIMEOUT_MINUTES = integer("PRE_LOGIN_CSRF_TIMEOUT_MINUTES", 60, 0);

/**
 * PostgreSQL の接続先（例：postgres://user:password@host:5432/dbname）。パスワードを含むため、ログに出さないこと。
 * パスワードは DATABASE_URL に含めるか、DATABASE_PASSWORD_FILE にファイルのパスを指定する（compose の secrets 用）。
 * ファイルは /run/secrets/ の下に置く。deno.json の permissions で、読み込みをそこだけ許可している。
 * どちらもないと pg が ~/.pgpass を読もうとし、permissions で拒否される。
 * pg は PGSSLMODE など PG で始まる環境変数も読むため、deno.json の permissions で PG* を許可している。
 */
export const DATABASE_URL = parseDatabaseUrl(
  Deno.env.get("DATABASE_URL"),
  Deno.env.get("DATABASE_PASSWORD_FILE"),
);

/**
 * Pool が同時に開く DB の接続の数。アプリのインスタンスの数を掛けた数が、
 * PostgreSQL の max_connections（既定 100）から管理用の余裕を引いた数に収まるようにする。
 */
export const DB_POOL_MAX = integer("DB_POOL_MAX", 10, 1);

/**
 * 接続の空きを待つ（空きがなければ新しく接続する）秒数。過ぎたらリクエストに 503 を返す。
 * 待ちに上限がないと、DB が遅くなったときに待つリクエストが無期限にたまるため。
 */
export const DB_CONNECTION_TIMEOUT_SECONDS = integer("DB_CONNECTION_TIMEOUT_SECONDS", 5, 1);

/** 1 つの問い合わせ（SQL の文）にかけてよい秒数。DB が過ぎた文を取り消し、リクエストに 503 を返す。 */
export const DB_STATEMENT_TIMEOUT_SECONDS = integer("DB_STATEMENT_TIMEOUT_SECONDS", 10, 1);

/** 不正な値や、範囲が広すぎる値があれば例外を投げる。 */
export function parseTrustedProxies(raw: string | undefined): Cidr[] {
  if (raw === undefined || raw.trim() === "") return [];
  return raw.split(",").map((item) => {
    const cidr = parseCidr(item.trim());
    // 末尾のカンマなどで空になった値も分かるよう、引用符で囲んで示す
    const shown = JSON.stringify(item);
    if (!cidr) {
      throw new Error(
        `環境変数 TRUSTED_PROXIES に IP アドレスか CIDR（ホスト部が 0）でない値があります: ${shown}`,
      );
    }
    // 0.0.0.0/0 や、0.0.0.0/1,128.0.0.0/1 のように分けて全体を信頼する書き間違いを防ぐ。
    // プロキシのアドレスの範囲は、クラウドのロードバランサーのサブネットでもこれより狭い
    const min = cidr.bytes.length === 4 ? 8 : 32;
    if (cidr.prefix < min) {
      throw new Error(
        `環境変数 TRUSTED_PROXIES の範囲が広すぎます（/${min} 以上にしてください）: ${shown}`,
      );
    }
    return cidr;
  });
}

/** raw は DATABASE_URL、passwordFile は DATABASE_PASSWORD_FILE の値。 */
export function parseDatabaseUrl(
  raw: string | undefined,
  passwordFile: string | undefined,
): string {
  if (raw === undefined || raw === "") throw new Error("環境変数 DATABASE_URL を設定してください");
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

function integer(name: string, fallback: number, min: number): number {
  return parseInteger(name, Deno.env.get(name), fallback, min);
}

/** raw が未設定か空なら fallback を返す。min 以上の整数でなければ、name を示して例外を投げる。 */
export function parseInteger(
  name: string,
  raw: string | undefined,
  fallback: number,
  min: number,
): number {
  if (raw === undefined || raw === "") return fallback;
  const value = Number(raw);
  if (!/^\d+$/.test(raw) || !Number.isSafeInteger(value) || value < min) {
    throw new Error(`環境変数 ${name} は ${min} 以上の整数にしてください: ${raw}`);
  }
  return value;
}

export function parseListenHost(raw: string | undefined): string {
  if (raw === undefined || raw === "") return "0.0.0.0";
  if (parseIp(raw) === undefined) {
    throw new Error(`環境変数 LISTEN_HOST は IP アドレスにしてください: ${raw}`);
  }
  return raw;
}

export function parseAppMode(raw: string | undefined): AppMode {
  if (raw === undefined || raw === "") return "PROD";
  const mode = APP_MODES.find((m) => m === raw);
  if (!mode) {
    throw new Error(`環境変数 APP_MODE は ${APP_MODES.join("・")} のどれかにしてください: ${raw}`);
  }
  return mode;
}
