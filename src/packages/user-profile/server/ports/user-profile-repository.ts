import type { UserProfile } from "sugumi/packages/user-profile/shared/types/user-profile.js";
import type { UserId } from "sugumi/platform/shared/types/user.js";

/**
 * 複数サービスが共有する業務の外部境界（規約 §3.2 の表の第3行）。
 * 認証基盤としての利用者（`src/platform/server/ports/`）とは別物であり、
 * こちらは「業務としての表示プロフィール」を扱う（§2.1 の platform / packages 境界）。
 *
 * port が import してよいのは shared の型だけである（§2.3）。
 * 実装（adapter）は対応する port と同じエリアに置き、`hosts` からのみ import する（§3.2 / §2.3）。
 *
 * TODO(フェーズ4): admin の「有効化」機能で書き込みが要る。
 * 追加するメソッド名は §11.4 の書き込み系接頭辞（`update` 等）に従うこと。
 */
export interface UserProfileRepository {
  findByUserId(userId: UserId): Promise<UserProfile | null>;
  listByUserIds(userIds: readonly UserId[]): Promise<readonly UserProfile[]>;
}
