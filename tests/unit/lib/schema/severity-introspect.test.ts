import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { Schema, s, walk, type FieldInfo } from "../../../../src/lib/schema/index.ts";
import { fail, ok, type InternalResult } from "../../../../src/lib/schema/error.ts";
import type { ParseContext } from "../../../../src/lib/schema/types.ts";

/** 成功にwarningを添える独自スキーマ。 */
class WarnOnEmptyString extends Schema<string> {
  _parse(input: unknown, ctx: ParseContext): InternalResult<string> {
    if (typeof input !== "string") {
      return fail([{ path: ctx.path, type: "error", code: "invalid_type", key: "custom.invalid_type", params: {} }]);
    }
    if (input === "") {
      return ok(input, [{ path: ctx.path, type: "warning", code: "empty", key: "custom.empty", params: {} }]);
    }
    return ok(input);
  }
}

describe("severity", () => {
  it("warningは成功した結果に添える", () => {
    const result = new WarnOnEmptyString().safeParse("");
    assert.ok(result.success);
    assert.equal(result.data, "");
    assert.equal(result.issues?.[0]?.type, "warning");
  });

  it("入れ子のwarningはobjectを通して上がる", () => {
    const schema = s.object({ name: new WarnOnEmptyString() });
    const result = schema.safeParse({ name: "" });
    assert.ok(result.success);
    assert.equal(result.issues?.length, 1);
    assert.deepEqual(result.issues?.[0]?.path, ["name"]);
  });

  it("errorが1つでもあれば失敗する", () => {
    const schema = s.object({ name: new WarnOnEmptyString(), age: s.number({ required: true }) });
    assert.equal(schema.safeParse({ name: "", age: "x" }).success, false);
  });
});

function byPath(fields: FieldInfo[], path: (string | number)[]): FieldInfo | undefined {
  return fields.find((f) => f.path.length === path.length && f.path.every((p, i) => p === path[i]));
}

describe("walk", () => {
  it("末端の項目のtypeNameとoptionsを返す", () => {
    const user = s.object({
      name: s.string({ required: true, label: "名前", minLength: 1, maxLength: 20 }),
    });
    const fields = walk(user);
    assert.equal(fields.length, 1);
    assert.deepEqual(fields[0]?.path, ["name"]);
    assert.equal(fields[0]?.typeName, "string");
    assert.deepEqual(fields[0]?.options, { required: true, label: "名前", minLength: 1, maxLength: 20 });
  });

  it("入れ子のobjectはキーをpathにして辿る", () => {
    const schema = s.object({ profile: s.object({ age: s.number({ required: true, min: 0 }) }) });
    const field = byPath(walk(schema), ["profile", "age"]);
    assert.equal(field?.typeName, "number");
    assert.deepEqual(field?.options, { required: true, min: 0 });
  });

  it("array/recordは自身を1項目として出し、要素のスキーマをpathに添字0を入れて辿る", () => {
    const schema = s.object({
      tags: s.array(s.string({ required: true, maxLength: 10 }), { required: true, minLength: 1 }),
      scores: s.record(s.number({ required: true })),
    });
    const fields = walk(schema);
    assert.equal(fields.length, 4);
    assert.equal(byPath(fields, ["tags"])?.typeName, "array");
    assert.deepEqual(byPath(fields, ["tags"])?.options, { required: true, minLength: 1 });
    assert.equal(byPath(fields, ["tags", 0])?.typeName, "string");
    assert.equal(byPath(fields, ["scores"])?.typeName, "record");
    assert.equal(byPath(fields, ["scores", 0])?.typeName, "number");
  });

  it("tupleは自身を1項目として出し、位置をpathにして辿る", () => {
    const fields = walk(s.tuple([s.number({ required: true }), s.string({ required: true })], { required: true }));
    assert.equal(byPath(fields, [])?.typeName, "tuple");
    assert.equal(byPath(fields, [0])?.typeName, "number");
    assert.equal(byPath(fields, [1])?.typeName, "string");
  });

  it("intersectionは合成する各objectの項目を同じ階層に並べる", () => {
    const hasId = s.object({ id: s.number({ required: true }) }, { required: true });
    const hasName = s.object({ name: s.string({ required: true }) }, { required: true });
    const fields = walk(s.intersection([hasId, hasName]));
    assert.equal(byPath(fields, ["id"])?.typeName, "number");
    assert.equal(byPath(fields, ["name"])?.typeName, "string");
  });

  it("unionは展開せず1項目として扱う", () => {
    const fields = walk(s.object({ value: s.union([s.string({ required: true }), s.number({ required: true })]) }));
    assert.equal(fields.length, 1);
    assert.equal(byPath(fields, ["value"])?.typeName, "union");
  });
});
