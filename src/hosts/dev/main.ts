import { resolveRepoRoot } from "sugumi/platform/server/runtime/repo-root.js";
import { adminService } from "sugumi/services/admin/server/service.js";
import { appService } from "sugumi/services/app/server/service.js";

/**
 * 開発用に複数サービスを1プロセスへマウントする合成ルート（規約 §15.1 / §15.3）。
 * 既定（本番）は「サービスごとに host・独立ポート」であり、本 host はその代替ではない（§15.5）。
 *
 * TODO(フェーズ2): サービスごとに別々の `node:http` サーバーを別ポートで listen する（§15.3）。
 * 設定は複数サービス形式（`PORT_<SERVICE_NAME>` / `BASE_URL_<SERVICE_NAME>`）に固定して検証する（§6.5）。
 * 掃除ジョブ（§3.3）は基盤資源につき1本にする（サービスごとに立てない）。
 */
export function createDevHost() {
  return {
    repoRoot: resolveRepoRoot(import.meta.url),
    services: [appService, adminService],
  } as const;
}
