import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { s } from "../../../src/lib/_shared/schema/index.ts";
import { inputAttributes } from "../../../src/web/form.ts";

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
    detail: s.string({
      required: (ctx) => ctx.values.role === "admin",
      maxLength: (ctx) => (ctx.values.role === "admin" ? 10 : 100),
    }),
    limit: s.number({ required: true, min: () => 1, max: 9 }),
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

  it("動的な制約は属性にしない", () => {
    assert.deepEqual(inputAttributes(schema, "detail"), {});
    assert.deepEqual(inputAttributes(schema, "limit"), { type: "number", required: true, max: 9, step: "any" });
  });

  it("その他のスキーマはrequiredだけ", () => {
    assert.deepEqual(inputAttributes(schema, "role"), { required: true });
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- 存在しない項目名を渡す確認
    assert.throws(() => inputAttributes(schema, "missing" as keyof typeof schema.shape), /項目がありません/);
  });
});
