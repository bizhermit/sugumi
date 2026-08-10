import type { PlatformDeps } from "../deps.js";

/**
 * ルート定義（規約 §6.4）。`URLPattern` による手動登録とし、ファイル名でのルーティングは行わない。
 */

/** 認可の宣言。省略不可・既定値なし（書き忘れ＝最も緩い扱い、を作らないため。§6.4） */
export type Access =
  /** 未認証で到達してよい（理由コメント必須。§6.4） */
  | "public"
  /** 有効なセッションが必須 */
  | "authenticated";

/**
 * ハンドラ。`D` はサービスが確定させる依存の型（§3.3 の2段 Deps）。
 *
 * TODO(フェーズ2): §6.4 の正本は `(ctx: RequestContext, deps: D) => Promise<HandlerResult>` である。
 * `HandlerResult`（§6.3・`src/platform/server/http/handler.ts`）は `Html`（§6.1）と
 * `SafeRedirect`（§9.5）を要求し、いずれもフェーズ2の実装であるため、フェーズ1は引数のみの縮約形に留める。
 * フェーズ1のルートは0本（`ServiceDef.routes: []`）であり、ハンドラの実体は1つも存在しない。
 */
export type Handler<D extends PlatformDeps = PlatformDeps> = (
  deps: D,
) => Promise<void>;

export type RouteDef<D extends PlatformDeps = PlatformDeps> = {
  readonly method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  /** インスタンスはモジュール読み込み時に1度だけ生成する（リクエストごとに new しない。§6.4） */
  readonly pattern: URLPattern;
  /** 必須。ディスパッチャがハンドラ呼び出し前に評価する（§6.4） */
  readonly access: Access;
  readonly handler: Handler<D>;
};
