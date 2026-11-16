import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { s, type Infer } from "../../../../src/lib/schema/index.ts";

describe("record", () => {
  const scores = s.record(s.number({ required: true }), { required: true });

  it("すべての値が要素のスキーマに合うオブジェクトを受け付ける", () => {
    assert.deepEqual(scores.parse({ tokyo: 100, osaka: 50 }), { tokyo: 100, osaka: 50 });
  });

  it("オブジェクト以外は拒否する", () => {
    assert.equal(scores.safeParse([1, 2]).success, false);
    assert.equal(scores.safeParse("x").success, false);
  });

  it("issueのpathにキーが入る", () => {
    const result = scores.safeParse({ tokyo: 100, osaka: "x" });
    assert.ok(!result.success);
    assert.deepEqual(result.error.issues[0]?.path, ["osaka"]);
  });

  it("キーの数のminLength/maxLength/length", () => {
    const bounded = s.record(s.number({ required: true }), { required: true, minLength: 1, maxLength: 2 });
    assert.equal(bounded.safeParse({}).success, false);
    assert.equal(bounded.safeParse({ a: 1, b: 2, c: 3 }).success, false);
    assert.equal(bounded.safeParse({ a: 1 }).success, true);

    const exact = s.record(s.number({ required: true }), { required: true, length: 2 });
    assert.equal(exact.safeParse({ a: 1 }).success, false);
    assert.equal(exact.safeParse({ a: 1, b: 2 }).success, true);
  });

  it("Record<string, T>の型になる", () => {
    type Scores = Infer<typeof scores>;
    const value: Scores = { tokyo: 1 };
    assert.equal(value.tokyo, 1);
  });
});

describe("tuple", () => {
  const point = s.tuple([s.number({ required: true }), s.number({ required: true })], { required: true });

  it("固定長で位置ごとに検証する", () => {
    assert.deepEqual(point.parse([1, 2]), [1, 2]);
  });

  it("配列以外は拒否する", () => {
    assert.equal(point.safeParse({ 0: 1, 1: 2 }).success, false);
  });

  it("長さが違えば拒否する", () => {
    assert.equal(point.safeParse([1]).success, false);
    assert.equal(point.safeParse([1, 2, 3]).success, false);
  });

  it("issueのpathに位置が入る", () => {
    const result = point.safeParse([1, "x"]);
    assert.ok(!result.success);
    assert.deepEqual(result.error.issues[0]?.path, [1]);
  });

  it("位置ごとの型になる", () => {
    const mixed = s.tuple([s.string({ required: true }), s.number({ required: true }), s.boolean({ required: true })], {
      required: true,
    });
    type Mixed = Infer<typeof mixed>;
    const value: Mixed = ["a", 1, true];
    assert.deepEqual(value, ["a", 1, true]);
  });
});
