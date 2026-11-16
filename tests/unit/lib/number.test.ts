import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { formatNumber, parseNumber } from "../../../src/lib/number.ts";

describe("parseNumber", () => {
  it("10進の数字を数値に変換する", () => {
    assert.equal(parseNumber("1"), 1);
    assert.equal(parseNumber(" -1.5 "), -1.5);
    assert.equal(parseNumber("+2"), 2);
  });

  it("全角の数字と記号を半角に変換し、桁区切りのカンマを除去する", () => {
    assert.equal(parseNumber("１，２３４．５"), 1234.5);
    assert.equal(parseNumber("−１"), -1);
    assert.equal(parseNumber("ー１"), -1);
    assert.equal(parseNumber("－１"), -1);
  });

  it("数値にできない文字列はundefined", () => {
    for (const text of ["", "abc", "0x10", "1e3", "Infinity", "1.", ".5", "1 000", "1,2,3", ",1", "1,", "1,,000"]) {
      assert.equal(parseNumber(text), undefined, text);
    }
  });
});

describe("formatNumber", () => {
  it("桁区切りを付ける", () => {
    assert.equal(formatNumber(1234567.891), "1,234,567.891");
  });

  it("decimalsを指定すればその桁数に揃える", () => {
    assert.equal(formatNumber(1234.5, 2), "1,234.50");
    assert.equal(formatNumber(1234.567, 2), "1,234.57");
    assert.equal(formatNumber(1234, 0), "1,234");
  });
});
