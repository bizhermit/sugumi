import type { UserId } from "sugumi/platform/shared/types/user.js";

/**
 * サービス間で共有する利用者プロフィール（規約 §2.1 の packages の定義。2026-08-10 裁定）。
 * 業務語彙であるため platform には置けない（§2.1「platform は業務知識を持たない」）。
 */
export type UserProfile = {
  readonly userId: UserId;
  /** 画面に出す表示名 */
  readonly displayName: string;
  /** 利用停止中の利用者を一覧で区別するため（admin の「有効化」機能。2026-08-10 裁定） */
  readonly isEnabled: boolean;
};
