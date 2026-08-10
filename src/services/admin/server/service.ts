import type { ServiceDef } from "sugumi/platform/server/runtime/service.js";
import type { AdminDeps } from "./deps.js";

/**
 * admin サービスの宣言（規約 §15.2）。
 * `assetNamespaces` は配信（§6.6）と CSP（§9.1）の唯一の正本であり、
 * 宣言と実際の import の一致は §12.4-35 が双方向で検査する。
 *
 * TODO(フェーズ2〜4): `routes` に feature ごとの `readonly RouteDef<AdminDeps>[]` を連結する（§6.4）。
 */
export const adminService: ServiceDef<AdminDeps> = {
  name: "admin",
  routes: [],
  assetNamespaces: ["platform", "packages/user-profile", "services/admin"],
};
