import type { ServiceDef } from "sugumi/platform/server/runtime/service.js";

/**
 * app サービスの宣言（規約 §15.2）。サービスはプロセスを起動せず、本定義を1つ export するだけ。
 * import してよいのは `src/hosts/<name>/main.ts` だけである（§15.2）。
 *
 * TODO(フェーズ2〜4): `routes` に feature ごとの `readonly RouteDef<D>[]` を連結する（§6.4）。
 * 依存が基盤だけで足りなくなったら `src/services/app/server/deps.ts` に
 * `AppDeps extends PlatformDeps` を定義し、`ServiceDef<AppDeps>` にする（§3.3）。
 */
export const appService: ServiceDef = {
  name: "app",
  routes: [],
  // packages/user-profile はフェーズ4で app が使い始めた時点で宣言と references を同時に足す（§12.4-34(c) / -35）
  assetNamespaces: ["platform", "services/app"],
};
