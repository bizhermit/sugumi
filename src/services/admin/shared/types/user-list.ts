import type { UserProfile } from "sugumi/packages/user-profile/shared/types/user-profile.js";

/**
 * admin サービスの業務型（2026-08-10 裁定「admin＝ユーザー一覧・有効化」）。
 * 共有部品である `UserProfile` は packages 側が正本であり、ここでは一覧の行として包むだけ（§2.2）。
 */
export type UserListItem = {
  readonly profile: UserProfile;
  /** 操作者が「有効化」を実行できる行かどうか（認可の一次判定はディスパッチャ。§6.4） */
  readonly canEnable: boolean;
};
