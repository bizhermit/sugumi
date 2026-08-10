// T1-11 実測用フィクスチャ: services/app/client/pages の同一ディレクトリ内モジュール。
// task-list.js から「相対 import」で読み込まれる（bare specifier ではない連鎖）。
export function formatCount(n) {
  return `count=${n}`;
}
