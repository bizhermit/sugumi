import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { s } from "../../../src/lib/schema/index.ts";
import { formToObject, inputAttributes, validateForm } from "../../../src/web/form.ts";

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
    const result = validateForm(schema, formData([["username", ""]]), { "string.required": () => "必須" });
    assert.ok(!result.ok);
    assert.deepEqual(result.errors, { username: ["必須"] });
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

describe("inputAttributes", () => {
  const schema = s.object({
    email: s.string({ required: true, type: "email", minLength: 3, maxLength: 64, pattern: /@example\.com$/ }),
    note: s.string(),
    count: s.number({ required: true, type: "int", min: 0, max: 10 }),
    price: s.number({ decimals: 2 }),
    birthday: s.date({ max: Temporal.PlainDate.from("2024-12-31") }),
    startsAt: s.datetime({ required: true, min: Temporal.ZonedDateTime.from("2024-01-15T00:00[UTC]") }),
    opensAt: s.time({ min: Temporal.PlainTime.from("09:00"), max: Temporal.PlainTime.from("18:00") }),
    agree: s.boolean({ required: { disallowFalse: true } }),
    flag: s.boolean({ required: true }),
    role: s.enum(["admin", "user"], { required: true }),
  });

  it("stringはtype/required/minlength/maxlength。patternはHTMLと意味が違うので出さない", () => {
    assert.deepEqual(inputAttributes(schema, "email"), { type: "email", required: true, minlength: 3, maxlength: 64 });
    assert.deepEqual(inputAttributes(schema, "note"), {});
  });

  it("numberはtype=numberとmin/max/step", () => {
    assert.deepEqual(inputAttributes(schema, "count"), { type: "number", required: true, min: 0, max: 10, step: 1 });
    assert.deepEqual(inputAttributes(schema, "price"), { type: "number", step: 0.01 });
  });

  it("date/datetime/timeはそれぞれのtypeと、inputのvalueの形式のmin/max", () => {
    assert.deepEqual(inputAttributes(schema, "birthday"), { type: "date", max: "2024-12-31" });
    assert.deepEqual(inputAttributes(schema, "startsAt"), {
      type: "datetime-local",
      required: true,
      min: "2024-01-15T09:00",
    });
    assert.deepEqual(inputAttributes(schema, "opensAt"), { type: "time", min: "09:00", max: "18:00" });
  });

  it("booleanはdisallowFalseのときだけrequired（チェック済みが必須）", () => {
    assert.deepEqual(inputAttributes(schema, "agree"), { required: true });
    assert.deepEqual(inputAttributes(schema, "flag"), {});
  });

  it("その他のスキーマはrequiredだけ", () => {
    assert.deepEqual(inputAttributes(schema, "role"), { required: true });
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- 存在しない項目名を渡す確認
    assert.throws(() => inputAttributes(schema, "missing" as keyof typeof schema.shape), /項目がありません/);
  });
});
