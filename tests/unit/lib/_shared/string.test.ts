import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { graphemeLength, toHalfWidth, toHyphen } from "../../../../src/lib/_shared/string.ts";

describe("graphemeLength", () => {
  it("絵文字（サロゲートペア、ZWJ）と結合文字を1文字に数える", () => {
    assert.equal(graphemeLength("abc"), 3);
    assert.equal(graphemeLength("😀😀"), 2);
    assert.equal(graphemeLength("👨‍👩‍👧‍👦"), 1);
    assert.equal(graphemeLength("é"), 1);
    assert.equal(graphemeLength(""), 0);
  });
});

describe("toHyphen", () => {
  it("ダッシュに見える文字をハイフンに変換する", () => {
    assert.equal(toHyphen("1−2ー3‐4―5"), "1-2-3-4-5");
  });
});

describe("toHalfWidth", () => {
  it("全角の英数字と記号と全角スペースを半角に変換", () => {
    assert.equal(toHalfWidth("ＡＢＣ　１２３－（）＠"), "ABC 123-()@");
  });

  it("かなと漢字と半角は維持", () => {
    assert.equal(toHalfWidth("テスト 日本語 abc"), "テスト 日本語 abc");
  });
});
