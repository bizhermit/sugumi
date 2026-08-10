import type {
  AssetNamespace,
  ServiceName,
} from "sugumi/platform/shared/types/service.js";
import type { PlatformDeps } from "../deps.js";
import type { RouteDef } from "../http/route.js";

/**
 * サービスの宣言（規約 §15.2）。サービスはプロセスを起動せず、自分の定義を1つ export するだけ。
 * `RouteDef` と `PlatformDeps` を参照するため `shared` には置けない（§15.2）。
 * `D` を確定させるのは host である（§3.3）。
 */
export type ServiceDef<D extends PlatformDeps = PlatformDeps> = {
  /** URL 名前空間（`/assets/services/<name>/`）とディレクトリ名に一致させる（§15.2） */
  readonly name: ServiceName;
  readonly routes: readonly RouteDef<D>[];
  /** 静的配信（§6.6）と CSP（§9.1）の唯一の正本。宣言と実 import の一致は §12.4-35 が検査する */
  readonly assetNamespaces: readonly AssetNamespace[];
};
