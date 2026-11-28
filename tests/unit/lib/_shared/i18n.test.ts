import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  createI18n,
  localeFromAcceptLanguage,
  placeholderNames,
  toLocale,
  withAddonPrefix,
} from "../../../../src/lib/_shared/i18n.ts";

describe("createI18n", () => {
  const { locale, $t: t } = createI18n("en", {
    hello: "Hello, {{name}}! {{name}} has {{count}} items.",
    plain: "Plain",
  });

  it("言語を保持する", () => {
    assert.equal(locale, "en");
  });

  it("{{名前}}を値で置き換える", () => {
    assert.equal(t("hello", { name: "Alice", count: 0 }), "Hello, Alice! Alice has 0 items.");
  });

  it("値がない名前は置き換えずに残す", () => {
    assert.equal(t("hello", { name: null }), "Hello, {{name}}! {{name}} has {{count}} items.");
    assert.equal(t("hello"), "Hello, {{name}}! {{name}} has {{count}} items.");
  });

  it("文言がないキーはキーそのものを返す", () => {
    assert.equal(t("missing", { name: "x" }), "missing");
  });

  it("プロトタイプ鎖の値を文言や値として読まない", () => {
    assert.equal(t("constructor"), "constructor");
    assert.equal(createI18n("en", { key: "{{toString}}" }).$t("key", {}), "{{toString}}");
  });
});

describe("withAddonPrefix", () => {
  it("キーにaddonの接頭辞を付ける", () => {
    assert.deepEqual(withAddonPrefix("auth", { hoge: "A", "login.title": "B" }), {
      "auth.hoge": "A",
      "auth.login.title": "B",
    });
  });
});

describe("placeholderNames", () => {
  it("{{名前}}の名前を、出てきた順にすべて返す", () => {
    assert.deepEqual(placeholderNames("{{a}}と{{b}}と{{a}}"), ["a", "b", "a"]);
    assert.deepEqual(placeholderNames("名前なし {single}"), []);
  });
});

describe("toLocale", () => {
  it("地域や大文字小文字の違いを無視して、対応している言語に直す", () => {
    assert.equal(toLocale("ja"), "ja");
    assert.equal(toLocale("en-US"), "en");
    assert.equal(toLocale(" EN-gb "), "en");
  });

  it("対応していない言語はundefined", () => {
    assert.equal(toLocale("fr"), undefined);
    assert.equal(toLocale(""), undefined);
    assert.equal(toLocale("*"), undefined);
  });
});

describe("localeFromAcceptLanguage", () => {
  it("優先度が最も高い対応言語を選ぶ", () => {
    assert.equal(localeFromAcceptLanguage("fr-FR,fr;q=0.9,en-US;q=0.8,ja;q=0.7"), "en");
    assert.equal(localeFromAcceptLanguage("ja;q=0.5, en;q=0.9"), "en");
  });

  it("優先度が同じなら先に書かれたものを選ぶ", () => {
    assert.equal(localeFromAcceptLanguage("en,ja"), "en");
    assert.equal(localeFromAcceptLanguage("ja,en"), "ja");
  });

  it("q=0の言語は選ばない", () => {
    assert.equal(localeFromAcceptLanguage("en;q=0, ja;q=0.1"), "ja");
    assert.equal(localeFromAcceptLanguage("en;q=0"), undefined);
  });

  it("対応している言語がなければundefined", () => {
    assert.equal(localeFromAcceptLanguage(""), undefined);
    assert.equal(localeFromAcceptLanguage("fr,de;q=0.8"), undefined);
  });

  it("先頭の10件より後ろは見ない", () => {
    assert.equal(localeFromAcceptLanguage(`${"fr,".repeat(10)}en`), undefined);
  });
});
