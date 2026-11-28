import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { $array } from "../../../../../src/lib/_shared/schema/array.ts";
import { fail, ok, type InternalResult } from "../../../../../src/lib/_shared/schema/error.ts";
import { $intersection } from "../../../../../src/lib/_shared/schema/intersection.ts";
import { walk, type FieldInfo } from "../../../../../src/lib/_shared/schema/introspect.ts";
import { $object } from "../../../../../src/lib/_shared/schema/object.ts";
import { $number, $string } from "../../../../../src/lib/_shared/schema/primitives.ts";
import { $record } from "../../../../../src/lib/_shared/schema/record.ts";
import { Schema } from "../../../../../src/lib/_shared/schema/schema.ts";
import { $tuple } from "../../../../../src/lib/_shared/schema/tuple.ts";
import type { ParseContext } from "../../../../../src/lib/_shared/schema/types.ts";
import { $union } from "../../../../../src/lib/_shared/schema/union.ts";

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
    const schema = $object({ name: new WarnOnEmptyString() });
    const result = schema.safeParse({ name: "" });
    assert.ok(result.success);
    assert.equal(result.issues?.length, 1);
    assert.deepEqual(result.issues?.[0]?.path, ["name"]);
  });

  it("errorが1つでもあれば失敗する", () => {
    const schema = $object({ name: new WarnOnEmptyString(), age: $number({ required: true }) });
    assert.equal(schema.safeParse({ name: "", age: "x" }).success, false);
  });
});

function byPath(fields: FieldInfo[], path: (string | number)[]): FieldInfo | undefined {
  return fields.find((f) => f.path.length === path.length && f.path.every((p, i) => p === path[i]));
}

describe("walk", () => {
  it("末端の項目のtypeNameとoptionsを返す", () => {
    const user = $object({
      name: $string({ required: true, label: "名前", minLength: 1, maxLength: 20 }),
    });
    const fields = walk(user);
    assert.equal(fields.length, 1);
    assert.deepEqual(fields[0]?.path, ["name"]);
    assert.equal(fields[0]?.typeName, "string");
    assert.deepEqual(fields[0]?.options, { required: true, label: "名前", minLength: 1, maxLength: 20 });
  });

  it("入れ子のobjectはキーをpathにして辿る", () => {
    const schema = $object({ profile: $object({ age: $number({ required: true, min: 0 }) }) });
    const field = byPath(walk(schema), ["profile", "age"]);
    assert.equal(field?.typeName, "number");
    assert.deepEqual(field?.options, { required: true, min: 0 });
  });

  it("array/recordは自身を1項目として出し、要素のスキーマをpathに添字0を入れて辿る", () => {
    const schema = $object({
      tags: $array($string({ required: true, maxLength: 10 }), { required: true, minLength: 1 }),
      scores: $record($number({ required: true })),
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
    const fields = walk($tuple([$number({ required: true }), $string({ required: true })], { required: true }));
    assert.equal(byPath(fields, [])?.typeName, "tuple");
    assert.equal(byPath(fields, [0])?.typeName, "number");
    assert.equal(byPath(fields, [1])?.typeName, "string");
  });

  it("intersectionは合成する各objectの項目を同じ階層に並べる", () => {
    const hasId = $object({ id: $number({ required: true }) }, { required: true });
    const hasName = $object({ name: $string({ required: true }) }, { required: true });
    const fields = walk($intersection([hasId, hasName]));
    assert.equal(byPath(fields, ["id"])?.typeName, "number");
    assert.equal(byPath(fields, ["name"])?.typeName, "string");
  });

  it("unionは展開せず1項目として扱う", () => {
    const fields = walk($object({ value: $union([$string({ required: true }), $number({ required: true })]) }));
    assert.equal(fields.length, 1);
    assert.equal(byPath(fields, ["value"])?.typeName, "union");
  });
});
