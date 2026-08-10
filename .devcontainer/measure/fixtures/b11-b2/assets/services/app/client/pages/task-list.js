// T1-11 実測用フィクスチャ: services/app/client/pages（＝「pages」レイヤー）。
// エントリスクリプト（nonce 付き <script type="module">）から読み込まれる。
//
// 検証する連鎖:
//   1. 相対 import: ./task-count.js（同一ディレクトリ）
//   2. bare specifier（同一エリア別レイヤー）: sugumi/services/app/shared/format.js
//   3. bare specifier（エリアを跨ぐ: services → packages＝components）: sugumi/packages/user-profile/client/user-profile-card.js
//   4. renderCard() の内部でさらに bare specifier（エリアを跨ぐ: packages → platform＝基盤）:
//      sugumi/platform/client/dom.js（user-profile-card.js 側で import 済み）
//
// これで「pages → components → 基盤」のエリアを跨ぐ連鎖と、
// bare specifier / 相対 import の両方を1本の実行チェーンで確認する。
import { formatCount } from "./task-count.js";
import { TASK_LABEL } from "sugumi/services/app/shared/format.js";
import { renderCard } from "sugumi/packages/user-profile/client/user-profile-card.js";

const result = {
  relativeImportOk: typeof formatCount === "function",
  servicesBareSpecifierOk: typeof TASK_LABEL === "string",
  packagesBareSpecifierOk: typeof renderCard === "function",
  platformBareSpecifierOk: false,
  chainOutput: null,
  error: null,
};

try {
  const output = renderCard(`${TASK_LABEL}:${formatCount(3)}`);
  result.chainOutput = output;
  result.platformBareSpecifierOk =
    typeof output === "string" &&
    output.startsWith("[platform:mount] card:task:count=3");
} catch (e) {
  result.error = String((e && e.message) || e);
}

result.allOk =
  result.relativeImportOk &&
  result.servicesBareSpecifierOk &&
  result.packagesBareSpecifierOk &&
  result.platformBareSpecifierOk;

const el = document.getElementById("result");
if (el) el.textContent = JSON.stringify(result);
window.__B11_RESULT__ = result;
document.title = result.allOk ? "B11-PASS" : "B11-FAIL";
