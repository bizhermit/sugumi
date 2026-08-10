import type { UserProfile } from "sugumi/packages/user-profile/shared/types/user-profile.js";

/**
 * サービス間で共有する表示部品の公開 props（2026-08-10 裁定「両者が使うユーザー型＋表示部品」）。
 *
 * TODO(フェーズ4): 分類（§5.2）を決めたうえで、
 * 分類 A なら `src/packages/user-profile/{shared,client}/components/user-profile-card.ts` と
 * `public/assets/packages/user-profile/client/components/user-profile-card.css` の3ファイル構成にする（§11.5）。
 * CE クラスと CSS の対応は §12.4-39 が双方向で検査する。
 */
export type UserProfileCardProps = {
  readonly profile: UserProfile;
};
