// T1-11 実測用フィクスチャ: packages/user-profile/client（＝「components」レイヤー）。
// bare specifier（import map 経由）で platform（基盤）へエリアを跨いで import する。
import { mount } from "sugumi/platform/client/dom.js";

export function renderCard(name) {
  return mount(`card:${name}`);
}
