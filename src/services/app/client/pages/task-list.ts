import type { RegionName } from "sugumi/platform/shared/types/fragment.js";

/**
 * タスク一覧ページ（規約 §2.3「client 内部は pages → components → 基盤の一方向」の起点）。
 *
 * TODO(フェーズ4): 画面の実装。region ルート要素の `id` と `data-region` は本定数と同一文字列にする（§0.5）。
 */
export const TASK_LIST_REGION: RegionName = "main";
