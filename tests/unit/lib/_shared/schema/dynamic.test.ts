import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { s, type Infer } from "../../../../../src/lib/_shared/schema/index.ts";

// 値の型が意図せず広がる（省略ありになる）退行を、コンパイルで止めるための型。
type Equal<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;

const ctx = { path: [], values: { kind: "other" }, data: {} };
const refine = () => undefined;

describe("動的な制約", () => {
  const form = s.object({
    kind: s.enum(["email", "other"], { required: true }),
    detail: s.string({ required: (c) => c.values.kind === "other" }),
  });

  it("requiredが関数なら、他の項目の入力で必須かどうかが決まる", () => {
    assert.deepEqual(form.parse({ kind: "email" }), { kind: "email" });
    const result = form.safeParse({ kind: "other" });
    assert.equal(result.success, false);
    assert.deepEqual(
      result.error.issues.map((issue) => [issue.path, issue.code]),
      [[["detail"], "required"]],
    );
  });

  it("関数がundefinedを返したら、その制約を掛けない", () => {
    const schema = s.string({ maxLength: (c) => (c.data.strict ? 3 : undefined) });
    assert.equal(schema.parse("hello"), "hello");
    assert.equal(schema.safeParse("hello", { data: { strict: true } }).success, false);
  });

  it("parse()に渡したdataが関数に届く", () => {
    const schema = s.number({ max: (c) => (typeof c.data.limit === "number" ? c.data.limit : undefined) });
    assert.equal(schema.safeParse(10, { data: { limit: 5 } }).success, false);
    assert.equal(schema.parse(10, { data: { limit: 20 } }), 10);
  });

  it("入れ子の中でも、valuesはルートの入力のまま", () => {
    const schema = s.object({
      plan: s.string({ required: true }),
      profile: s.object({ company: s.string({ required: (c) => c.values.plan === "business" }) }),
    });
    assert.equal(schema.safeParse({ plan: "business", profile: {} }).success, false);
    assert.equal(schema.safeParse({ plan: "personal", profile: {} }).success, true);
  });

  it("配列の要素はpathで自分の位置が分かるので、同じ要素の他の項目を参照できる", () => {
    const items = s.array(
      s.object({
        type: s.enum(["free", "other"], { required: true }),
        note: s.string({
          required: (c) => {
            const rows = c.values.items;
            const index = c.path[1];
            if (!Array.isArray(rows) || typeof index !== "number") return false;
            const row: unknown = rows[index];
            return typeof row === "object" && row !== null && "type" in row && row.type === "other";
          },
        }),
      }),
    );
    const schema = s.object({ items });
    assert.equal(schema.safeParse({ items: [{ type: "free" }, { type: "other" }] }).success, false);
    assert.equal(schema.safeParse({ items: [{ type: "free" }, { type: "other", note: "x" }] }).success, true);
  });

  it("ルートの入力がオブジェクトでなければ、valuesは空", () => {
    const schema = s.string({ required: (c) => Object.keys(c.values).length > 0 });
    assert.equal(schema.parse(undefined), undefined);
  });

  it("refineにも同じctxが渡る", () => {
    const schema = s.string({
      required: true,
      refine: (value, c) => value === c.data.forbidden && { code: "forbidden" },
    });
    assert.equal(schema.safeParse("x", { data: { forbidden: "x" } }).success, false);
    assert.equal(schema.parse("x", { data: { forbidden: "y" } }), "x");
  });

  it("string/array/dateの制約も関数にできる", () => {
    assert.equal(s.string({ length: () => 2 }).safeParse("abc").success, false);
    assert.equal(s.string({ pattern: () => /^a/ }).safeParse("b").success, false);
    assert.equal(s.array(s.string(), { maxLength: () => 1 }).safeParse(["a", "b"]).success, false);
    const today = Temporal.PlainDate.from("2026-01-10");
    assert.equal(s.date({ min: () => today }).safeParse("2026-01-01").success, false);
    assert.equal(
      s.object({}, { required: (c) => c.data.strict === true }).safeParse(undefined, { data: { strict: true } })
        .success,
      false,
    );
  });

  it("関数が返したpatternにg/yフラグがあれば例外。lastIndexで結果が変わるため", () => {
    const schema = s.string({ pattern: () => /^ab$/g });
    assert.throws(() => schema.safeParse("ab"), /g\/yフラグ/);
  });

  it("optional()で動的なrequiredは外れる", () => {
    const optional = s.string({ required: () => true }).optional();
    assert.equal(optional.parse(undefined), undefined);
    assert.equal(optional.resolve(ctx), optional.options);
  });
});

describe("resolve", () => {
  it("動的なoptionがなければ、optionsそのものを返す", () => {
    const schema = s.string({ required: true, maxLength: 64 });
    assert.equal(schema.resolve(ctx), schema.options);
  });

  it("関数のoptionを今の入力で値に直す。refineとdefaultは関数のまま", () => {
    const schema = s.string({
      required: (c) => c.values.kind === "other",
      maxLength: 64,
      default: () => "x",
      refine,
    });
    const resolved = schema.resolve(ctx);
    assert.equal(resolved.required, true);
    assert.equal(resolved.maxLength, 64);
    assert.equal(typeof resolved.default, "function");
    assert.equal(resolved.refine, refine);
  });
});

describe("optionsの型", () => {
  it("渡した値は書いたとおりの型で読める", () => {
    const base = s.string({ required: true, maxLength: 64, label: "ユーザー" });
    assert.ok(true satisfies Equal<typeof base.options.maxLength, 64>);
    assert.ok(true satisfies Equal<typeof base.options.required, true>);
    assert.equal(base.options.maxLength, 64);
  });

  it("スプレッドで派生させても、元の値の型が残る", () => {
    const base = s.string({ required: true, maxLength: 64, label: "ユーザー" });
    const derived = s.string({ ...base.options, minLength: 1, label: "別名" });
    assert.ok(true satisfies Equal<typeof derived.options.maxLength, 64>);
    assert.ok(true satisfies Equal<typeof derived.options.minLength, 1>);
    assert.ok(true satisfies Equal<Infer<typeof derived>, string>);
    assert.equal(derived.options.label, "別名");
  });
});

describe("値の型", () => {
  it("requiredが関数なら省略ありになる", () => {
    const schema = s.object({ detail: s.string({ required: () => true }) }, { required: true });
    assert.ok(true satisfies Equal<Infer<typeof schema>, { detail: string | null | undefined }>);
  });

  it("required: { nullable: true } はnullだけ許す", () => {
    const nullable = s.string({ required: { nullable: true } });
    assert.ok(true satisfies Equal<Infer<typeof nullable>, string | null>);
  });

  it("booleanのrequired: { disallowFalse: true } は必須のまま", () => {
    const schema = s.boolean({ required: { disallowFalse: true } });
    assert.ok(true satisfies Equal<Infer<typeof schema>, boolean>);
  });

  it("pick/extend/partial/optional で派生しても、必須のobjectは必須のまま", () => {
    const user = s.object({ id: s.number({ required: true }), name: s.string({ required: true }) }, { required: true });
    assert.ok(true satisfies Equal<Infer<ReturnType<typeof user.pick<"id">>>, { id: number }>);
    assert.ok(
      true satisfies Equal<
        Infer<ReturnType<typeof user.partial>>,
        { id: number | null | undefined; name: string | null | undefined }
      >,
    );
    const extended = user.extend({ age: s.number() });
    assert.ok(
      true satisfies Equal<Infer<typeof extended>, { id: number; name: string; age: number | null | undefined }>,
    );
    const nullable = s.object({ id: s.number({ required: true }) }, { required: { nullable: true } }).partial();
    assert.ok(true satisfies Equal<Infer<typeof nullable>, { id: number | null | undefined } | null>);
  });
});
