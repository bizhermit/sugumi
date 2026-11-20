import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { s, type Infer } from "../../../../src/lib/schema/index.ts";

describe("object", () => {
  const user = s.object(
    {
      id: s.number({ required: true, type: "int" }),
      name: s.string({ required: true, minLength: 1 }),
      email: s.string({ type: "email" }),
    },
    { required: true },
  );

  type User = Infer<typeof user>;

  it("形の合うオブジェクトを受け付ける", () => {
    const parsed: User = user.parse({ id: 1, name: "Alice", email: "a@b.com" });
    assert.deepEqual(parsed, { id: 1, name: "Alice", email: "a@b.com" });
  });

  it("任意のフィールドは省略できる", () => {
    assert.deepEqual(user.parse({ id: 1, name: "Alice" }), { id: 1, name: "Alice" });
  });

  it("shapeに無いキーは捨てる", () => {
    assert.deepEqual(user.parse({ id: 1, name: "Alice", _csrf: "x" }), { id: 1, name: "Alice" });
  });

  it("不正なフィールド全部のissueをpath付きで集める", () => {
    const result = user.safeParse({ id: "x", name: "" });
    assert.ok(!result.success);
    const paths = new Set(result.error.issues.map((issue) => issue.path.join(".")));
    assert.ok(paths.has("id"));
    assert.ok(paths.has("name"));
  });

  it("extend/pick/omit", () => {
    const withRole = user.extend({ role: s.enum(["admin", "user"], { required: true }) });
    assert.deepEqual(withRole.parse({ id: 1, name: "A", role: "admin" }), { id: 1, name: "A", role: "admin" });

    const idOnly = user.pick(["id"]);
    assert.deepEqual(idOnly.parse({ id: 5 }), { id: 5 });

    const withoutEmail = user.omit(["email"]);
    assert.deepEqual(withoutEmail.parse({ id: 1, name: "A" }), { id: 1, name: "A" });
  });

  it("extend/pick/omit/partialはobject自身のrequired/labelを引き継ぎ、refineとdefaultは引き継がない", () => {
    const base = s.object(
      { id: s.number({ required: true }), name: s.string() },
      { required: true, label: "ユーザー", refine: () => ({ code: "never_ok" }), default: { id: 0, name: "" } },
    );
    const picked = base.pick(["id"]);
    const result = picked.safeParse(undefined);
    assert.ok(!result.success);
    assert.deepEqual(result.error.issues[0]?.params, { label: "ユーザー" });
    assert.deepEqual(picked.parse({ id: 1 }), { id: 1 });
    assert.deepEqual(base.partial().options, { required: true, label: "ユーザー" });
  });

  it("refineのissueにpathを付けると、その項目のエラーになる", () => {
    const pair = s.object(
      { password: s.string({ required: true }), confirm: s.string({ required: true }) },
      { refine: (value) => value.password !== value.confirm && { code: "mismatch", path: ["confirm"] } },
    );
    assert.deepEqual(pair.parse({ password: "a", confirm: "a" }), { password: "a", confirm: "a" });
    const result = pair.safeParse({ password: "a", confirm: "b" });
    assert.ok(!result.success);
    assert.deepEqual(
      result.error.issues.map((issue) => [issue.code, issue.path]),
      [["mismatch", ["confirm"]]],
    );
  });

  it("partial()でrequiredが外れると、booleanのdisallowFalseも外れる", () => {
    const patch = s.object({ agree: s.boolean({ required: { disallowFalse: true } }) }).partial();
    assert.deepEqual(patch.parse({}), {});
    assert.deepEqual(patch.parse({ agree: false }), { agree: false });
  });

  it("partial()はrequiredとdefaultを外し、型固有の制約は残す", () => {
    const creation = s.object({
      id: s.number({ required: true, type: "int" }),
      name: s.string({ required: true, minLength: 1, default: "anon" }),
      note: s.string({ required: { nullable: true } }),
    });

    const patch = creation.partial();

    assert.deepEqual(patch.parse({}), {});
    assert.deepEqual(patch.parse({ id: 1 }), { id: 1 });
    assert.deepEqual(patch.parse({ note: null }), { note: null });
    assert.equal(patch.safeParse({ id: 1.5 }).success, false);
  });

  it("deepPartial()は入れ子のobjectにも入る", () => {
    const creation = s.object({
      id: s.number({ required: true, type: "int" }),
      address: s.object(
        {
          city: s.string({ required: true }),
          zip: s.string({ required: true }),
        },
        { required: true },
      ),
    });

    const patch = creation.deepPartial();

    assert.deepEqual(patch.parse({}), {});
    assert.deepEqual(patch.parse({ address: {} }), { address: {} });
    assert.deepEqual(patch.parse({ address: { city: "Tokyo" } }), { address: { city: "Tokyo" } });
  });
});

describe("array", () => {
  it("要素のスキーマで配列を検証する", () => {
    const schema = s.array(s.number({ required: true }), { required: true });
    assert.deepEqual(schema.parse([1, 2, 3]), [1, 2, 3]);
  });

  it("issueのpathに要素の添字が入る", () => {
    const schema = s.array(s.number({ required: true }), { required: true });
    const result = schema.safeParse([1, "x", 3]);
    assert.ok(!result.success);
    assert.deepEqual(result.error.issues[0]?.path, [1]);
  });

  it("minLength/maxLength", () => {
    const schema = s.array(s.number({ required: true }), { required: true, minLength: 2, maxLength: 3 });
    assert.equal(schema.safeParse([1]).success, false);
    assert.equal(schema.safeParse([1, 2, 3, 4]).success, false);
    assert.equal(schema.safeParse([1, 2]).success, true);
  });
});

describe("union", () => {
  it("候補のどれかが空文字を受け付けるなら、空文字をnullにせず候補に渡す", () => {
    const schema = s.union([s.number({ required: true }), s.string({ required: true, allowEmpty: true })]);
    assert.equal(schema.parse(""), "");
    assert.equal(s.union([s.number({ required: true }), s.string({ required: true })]).parse(""), null);
  });

  it("候補のいずれかに合えば受け付ける", () => {
    const schema = s.union([s.string({ required: true }), s.number({ required: true })], { required: true });
    assert.equal(schema.parse("hi"), "hi");
    // stringが先に試され、数値を文字列にして通る。
    assert.equal(schema.parse(42), "42");
  });

  it("先の候補がstrictなら数値を文字列に変換せず失敗するため、次の候補（number）が42のまま通す", () => {
    const schema = s.union([s.string({ required: true, strict: true }), s.number({ required: true })], {
      required: true,
    });
    assert.equal(schema.parse(42), 42);
  });

  it("どの候補にも合わなければ拒否する", () => {
    const schema = s.union([s.string({ required: true }), s.number({ required: true })], { required: true });
    assert.equal(schema.safeParse({}).success, false);
  });
});
