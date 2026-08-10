import type { UserProfileCardProps } from "sugumi/packages/user-profile/client/user-profile-card.js";

/**
 * ユーザー一覧ページ（規約 §2.3「client 内部は pages → components → 基盤の一方向」の起点）。
 *
 * TODO(フェーズ4): 画面の実装。表示部品は packages 側の共有部品を使う（2026-08-10 裁定）。
 */
export type UserListPageProps = {
  readonly cards: readonly UserProfileCardProps[];
};
