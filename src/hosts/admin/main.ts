import { resolveRepoRoot } from "sugumi/platform/server/runtime/repo-root.js";
import { adminService } from "sugumi/services/admin/server/service.js";

/**
 * admin サービスの合成ルート（規約 §3.3 / §15.1）。
 *
 * TODO(フェーズ2): `AdminDeps`（`profiles` を含む）を組み立てて `serve()` へ渡す。
 * `UserProfileRepository` の adapter を import してよいのは本ファイルだけである（§2.3 / §3.2）。
 */
export function createAdminHost() {
  return {
    repoRoot: resolveRepoRoot(import.meta.url),
    services: [adminService],
  } as const;
}
