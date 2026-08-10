import { resolveRepoRoot } from "sugumi/platform/server/runtime/repo-root.js";
import { appService } from "sugumi/services/app/server/service.js";

/**
 * app サービスの合成ルート（規約 §3.3 / §15.1）。1つの main.ts が1つの OS プロセスに対応する。
 * ここだけが adapters と複数サービスを名指しで import してよい。
 *
 * TODO(フェーズ2): `createDeps(config)` で具象を組み、`serve()` に `ServiceDef` と一緒に渡す。
 * 併せて §6.5 の起動時アサート（`process.permission` の存在検査 →
 * `has("fs.read", <repo>/src) === false` 等）と graceful shutdown をここに置く。
 * モジュールスコープの副作用とシングルトンは禁止（§3.3）のため、組み立ては関数の中で行う。
 */
export function createAppHost() {
  return {
    /** §6.5 の起動時アサートと §3.4 の schema.sql 読み取りは、この1つの値を配って使う */
    repoRoot: resolveRepoRoot(import.meta.url),
    services: [appService],
  } as const;
}
