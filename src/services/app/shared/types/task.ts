import type { UserId } from "sugumi/platform/shared/types/user.js";

/** app サービスの業務型（2026-08-10 裁定「app＝ログイン＋タスク CRUD」）。 */

/** 識別子の取り違え防止のためのブランド型（a）（§11.4） */
export type TaskId = string & { readonly __brand: "TaskId" };

export type Task = {
  readonly id: TaskId;
  /** リソース単位の認可（IDOR 対策）はリポジトリ層のクエリに所有者条件を含めて行う（§6.4 / §9.3） */
  readonly ownerId: UserId;
  readonly title: string;
  readonly isDone: boolean;
};
