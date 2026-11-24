import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { s } from "../../../../src/lib/_shared/schema/index.ts";
import { formToObject, validateForm } from "../../../../src/web/_shared/form.ts";

function formData(entries: [string, string][]): FormData {
  const form = new FormData();
  for (const [name, value] of entries) form.append(name, value);
  return form;
}

describe("formToObject", () => {
  const schema = s.object({ name: s.string(), tags: s.array(s.string()) });

  it("_csrfを除き、arrayの項目は同じnameの値をすべて集める", () => {
    const form = formData([
      ["_csrf", "token"],
      ["name", "A"],
      ["tags", "x"],
      ["tags", "y"],
    ]);
    assert.deepEqual(formToObject(schema, form), { name: "A", tags: ["x", "y"] });
  });

  it("arrayでない項目に同じnameが複数届いた場合、配列のまま渡す（スキーマがinvalid_typeにする）", () => {
    const form = formData([
      ["name", "A"],
      ["name", "B"],
    ]);
    assert.deepEqual(formToObject(schema, form), { name: ["A", "B"] });
    const result = validateForm(s.object({ name: s.string() }), form);
    assert.ok(!result.ok);
    assert.deepEqual(Object.keys(result.errors), ["name"]);
  });

  it("__proto__というnameでプロトタイプを差し替えない", () => {
    const values = formToObject(schema, formData([["__proto__", "x"]]));
    assert.equal(Object.getPrototypeOf(values), Object.prototype);
    assert.deepEqual(Object.keys(values), ["__proto__"]);
  });
});

describe("validateForm", () => {
  const schema = s.object({
    username: s.string({ required: true, maxLength: 3, label: "ユーザー" }),
    age: s.number({ type: "int" }),
  });

  it("通れば変換後の値を返す", () => {
    const result = validateForm(
      schema,
      formData([
        ["username", "ab"],
        ["age", "20"],
      ]),
    );
    assert.ok(result.ok);
    assert.deepEqual(result.data, { username: "ab", age: 20 });
    assert.deepEqual(result.warnings, []);
  });

  it("失敗した場合、項目ごとの利用者向け文言と画面に戻す入力値を返す", () => {
    const result = validateForm(
      schema,
      formData([
        ["username", "abcd"],
        ["age", "x"],
      ]),
    );
    assert.ok(!result.ok);
    assert.deepEqual(result.errors, {
      username: ["ユーザーは3文字以内で入力してください"],
      age: ["値は数値で入力してください"],
    });
    assert.deepEqual(result.values, { username: "abcd", age: "x" });
  });

  it('項目に紐づかないエラー（objectのrefine）のキーは""（ブランク）', () => {
    const pair = s.object(
      { password: s.string({ required: true }), confirm: s.string({ required: true }) },
      { refine: (v) => v.password !== v.confirm && { code: "mismatch" } },
    );
    const result = validateForm(
      pair,
      formData([
        ["password", "a"],
        ["confirm", "b"],
      ]),
    );
    assert.ok(!result.ok);
    assert.deepEqual(Object.keys(result.errors), [""]);
  });

  it("辞書を渡せば文言を差し替えられる", () => {
    const result = validateForm(schema, formData([["username", ""]]), {
      messages: { "string.required": () => "必須" },
    });
    assert.ok(!result.ok);
    assert.deepEqual(result.errors, { username: ["必須"] });
  });

  it("dataを渡せば動的な制約に届く", () => {
    const codeForm = s.object({ code: s.string({ required: (ctx) => ctx.data.needsCode === true }) });
    assert.equal(validateForm(codeForm, formData([])).ok, true);
    assert.equal(validateForm(codeForm, formData([]), { data: { needsCode: true } }).ok, false);
  });

  it("スキーマに無い項目はwarningとして返し、失敗にはしない", () => {
    const result = validateForm(
      schema,
      formData([
        ["username", "ab"],
        ["extra", "1"],
      ]),
    );
    assert.ok(result.ok);
    assert.deepEqual(
      result.warnings.map((issue) => [issue.code, issue.path.join(".")]),
      [["unknown_key", "extra"]],
    );
  });
});
