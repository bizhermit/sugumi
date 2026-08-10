import type { UserProfileRepository } from "sugumi/packages/user-profile/server/ports/user-profile-repository.js";
import type { PlatformDeps } from "sugumi/platform/server/deps.js";

/**
 * admin サービス固有の依存（規約 §3.3 の2段 Deps の下段）。
 * 基盤に業務用の port を足すと platform が特定サービスに縛られるため、
 * **`PlatformDeps` を拡張する側に置く**（§3.3 / §2.2）。
 */
export interface AdminDeps extends PlatformDeps {
  readonly profiles: UserProfileRepository;
}
