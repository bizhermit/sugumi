import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { $array } from "../../../../src/lib/_shared/schema/array.ts";
import { $enum } from "../../../../src/lib/_shared/schema/enum.ts";
import { $object } from "../../../../src/lib/_shared/schema/object.ts";
import { $boolean, $date, $datetime, $number, $string, $time } from "../../../../src/lib/_shared/schema/primitives.ts";
import { formToObject, inputAttributes, validateForm } from "../../../../src/web/_shared/form.ts";

function formData(entries: [string, string][]): FormData {
  const form = new FormData();
  for (const [name, value] of entries) form.append(name, value);
  return form;
}

describe("formToObject", () => {
  const schema = $object({ name: $string(), tags: $array($string()) });

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
    const result = validateForm($object({ name: $string() }), form);
    assert.ok(!result.ok);
    assert.deepEqual(
      result.issues.map((issue) => issue.path.join(".")),
      ["name"],
    );
  });

  it("__proto__というnameでプロトタイプを差し替えない", () => {
    const values = formToObject(schema, formData([["__proto__", "x"]]));
    assert.equal(Object.getPrototypeOf(values), Object.prototype);
    assert.deepEqual(Object.keys(values), ["__proto__"]);
  });
});

describe("validateForm", () => {
  const schema = $object({
    username: $string({ required: true, maxLength: 3, label: "ユーザー" }),
    age: $number({ type: "int" }),
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
    assert.deepEqual(result.issues, []);
  });

  it("失敗した場合、スキーマのissuesと画面に戻す入力値を返す", () => {
    const result = validateForm(
      schema,
      formData([
        ["username", "abcd"],
        ["age", "x"],
      ]),
    );
    assert.ok(!result.ok);
    assert.deepEqual(
      result.issues.map((issue) => [issue.path.join("."), issue.key]),
      [
        ["username", "string.max"],
        ["age", "number.invalid_type"],
      ],
    );
    assert.deepEqual(result.values, { username: "abcd", age: "x" });
  });

  it("項目に紐づかないエラー（objectのrefine）のpathは空", () => {
    const pair = $object(
      { password: $string({ required: true }), confirm: $string({ required: true }) },
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
    assert.deepEqual(
      result.issues.map((issue) => issue.path),
      [[]],
    );
  });

  it("dataを渡せば動的な制約に届く", () => {
    const codeForm = $object({ code: $string({ required: (ctx) => ctx.data.needsCode === true }) });
    assert.equal(validateForm(codeForm, formData([])).ok, true);
    assert.equal(validateForm(codeForm, formData([]), { data: { needsCode: true } }).ok, false);
  });

  it("スキーマに無い項目は、フォーム自体へのwarningとして返し、失敗にはしない", () => {
    const result = validateForm(
      schema,
      formData([
        ["username", "ab"],
        ["extra", "1"],
      ]),
    );
    assert.ok(result.ok);
    assert.deepEqual(
      result.issues.map((issue) => [issue.type, issue.code, issue.path.join("."), issue.params.key]),
      [["warning", "unknown_key", "", "extra"]],
    );
  });
});

describe("inputAttributes", () => {
  const schema = $object({
    email: $string({ required: true, type: "email", minLength: 3, maxLength: 64, pattern: /@example\.com$/ }),
    note: $string(),
    count: $number({ required: true, type: "int", min: 0, max: 10 }),
    price: $number({ decimals: 2 }),
    birthday: $date({ max: Temporal.PlainDate.from("2024-12-31") }),
    startsAt: $datetime({ required: true, min: Temporal.ZonedDateTime.from("2024-01-15T00:00[UTC]") }),
    opensAt: $time({ min: Temporal.PlainTime.from("09:00"), max: Temporal.PlainTime.from("18:00") }),
    agree: $boolean({ required: { disallowFalse: true } }),
    flag: $boolean({ required: true }),
    role: $enum(["admin", "user"], { required: true }),
    detail: $string({
      required: (ctx) => ctx.values.role === "admin",
      maxLength: (ctx) => (ctx.values.role === "admin" ? 10 : 100),
    }),
    limit: $number({ required: true, min: () => 1, max: 9 }),
    until: $date({ min: (ctx) => (ctx.data.today instanceof Temporal.PlainDate ? ctx.data.today : undefined) }),
    confirm: $boolean({ required: (ctx) => (ctx.values.role === "admin" ? { disallowFalse: true } : false) }),
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

  it("今の状態を渡さなければ、動的な制約は属性にしない", () => {
    assert.deepEqual(inputAttributes(schema, "detail"), {});
    assert.deepEqual(inputAttributes(schema, "limit"), { type: "number", required: true, max: 9, step: "any" });
    assert.deepEqual(inputAttributes(schema, "until"), { type: "date" });
    assert.deepEqual(inputAttributes(schema, "confirm"), {});
  });

  it("今の状態を渡すと、動的な制約もその値で属性にする", () => {
    assert.deepEqual(inputAttributes(schema, "detail", { values: { role: "admin" } }), {
      required: true,
      maxlength: 10,
    });
    assert.deepEqual(inputAttributes(schema, "detail", { values: { role: "user" } }), { maxlength: 100 });
    assert.deepEqual(inputAttributes(schema, "limit", { values: {} }), {
      type: "number",
      required: true,
      min: 1,
      max: 9,
      step: "any",
    });
    assert.deepEqual(inputAttributes(schema, "confirm", { values: { role: "admin" } }), { required: true });
    assert.deepEqual(inputAttributes(schema, "confirm", { values: { role: "user" } }), {});
  });

  it("動的な制約がundefinedを返したら、その属性は付けない", () => {
    assert.deepEqual(inputAttributes(schema, "until", { values: {} }), { type: "date" });
    assert.deepEqual(
      inputAttributes(schema, "until", { values: {}, data: { today: Temporal.PlainDate.from("2026-11-25") } }),
      { type: "date", min: "2026-11-25" },
    );
  });
});
