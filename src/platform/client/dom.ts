import type {
  ApplyMode,
  FragmentSource,
} from "sugumi/platform/shared/types/fragment.js";

/**
 * DOM へ HTML を書き込んでよい唯一のファイル（規約 §6.2 / §12.4-12）。
 * 入口は `setHtml`（テンプレート由来・`Html` のみ受ける）と
 * `applyVerifiedFragment`（応答由来・`string` / `ReadableStream` を受ける唯一の関数）の2つに固定する。
 *
 * TODO(フェーズ2): 実装を本ファイルに置く。`setHtml` は `Html`（§6.1）が生まれた時点で追加する。
 * `applyVerifiedFragment` の呼び出し元は `src/platform/client/apply-fragment.ts` の1箇所に限る（§12.4-3）。
 * `innerHTML` / `outerHTML` / `setHTMLUnsafe` / `parseHTMLUnsafe` / `streamHTMLUnsafe` /
 * `insertAdjacentHTML` を本ファイル以外に書いてはならない（§12.4-12）。
 */
export type ApplyVerifiedFragment = (
  target: Element,
  source: FragmentSource,
  mode: ApplyMode,
) => Promise<void>;
