import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { $array } from "../../../../../src/lib/_shared/schema/array.ts";
import { $intersection } from "../../../../../src/lib/_shared/schema/intersection.ts";
import { walk } from "../../../../../src/lib/_shared/schema/introspect.ts";
import { $lazy } from "../../../../../src/lib/_shared/schema/lazy.ts";
import { $object } from "../../../../../src/lib/_shared/schema/object.ts";
import { $number, $string } from "../../../../../src/lib/_shared/schema/primitives.ts";
import type { Infer, Schema } from "../../../../../src/lib/_shared/schema/schema.ts";

describe("intersection", () => {
  const hasId = $object({ id: $number({ required: true }) }, { required: true });
  const hasName = $object({ name: $string({ required: true }) }, { required: true });
  const idAndName = $intersection([hasId, hasName], { required: true });
  type IdAndName = Infer<typeof idAndName>;

  it("合成する各objectの出力を1つにまとめる", () => {
    const parsed: IdAndName = idAndName.parse({ id: 1, name: "Alice" });
    assert.deepEqual(parsed, { id: 1, name: "Alice" });
  });

  it("いずれか1つのobjectでも拒否すれば失敗し、拒否したすべてのobjectのissueを返す", () => {
    const result = idAndName.safeParse({});
    assert.ok(!result.success);
    const paths = new Set(result.error.issues.map((issue) => issue.path.join(".")));
    assert.ok(paths.has("id"));
    assert.ok(paths.has("name"));
  });

  it("オブジェクト以外は拒否し、invalid_typeは1つだけを返す", () => {
    const result = idAndName.safeParse("nope");
    assert.ok(!result.success);
    assert.deepEqual(
      result.error.issues.map((issue) => issue.code),
      ["invalid_type"],
    );
  });

  it("他のobjectのキーはunknown_keyにならず、どのobjectにも無いキーだけwarningになる", () => {
    const result = idAndName.safeParse({ id: 1, name: "Alice", extra: "x" });
    assert.ok(result.success);
    assert.deepEqual(
      result.issues?.map((issue) => [issue.code, issue.path.join(".")]),
      [["unknown_key", ""]],
    );
    const failed = idAndName.safeParse({ id: 1 });
    assert.ok(!failed.success);
    assert.deepEqual(
      failed.error.issues.map((issue) => [issue.code, issue.path.join(".")]),
      [["required", "name"]],
    );
  });
});

describe("lazy", () => {
  interface TreeNode {
    value: number;
    children: TreeNode[];
  }

  const treeNode: Schema<TreeNode> = $object(
    {
      value: $number({ required: true }),
      children: $array(
        $lazy(() => treeNode),
        { required: true },
      ),
    },
    { required: true },
  );

  it("自分自身を参照する形を検証できる", () => {
    const input: TreeNode = {
      value: 1,
      children: [
        { value: 2, children: [] },
        { value: 3, children: [{ value: 4, children: [] }] },
      ],
    };
    assert.deepEqual(treeNode.parse(input), input);
  });

  it("深い位置のissueもpathが正しい", () => {
    const result = treeNode.safeParse({ value: 1, children: [{ value: "x", children: [] }] });
    assert.ok(!result.success);
    assert.deepEqual(result.error.issues[0]?.path, ["children", 0, "value"]);
  });

  it("初回利用時に1度だけ解決する", () => {
    let calls = 0;
    const inner = $number({ required: true });
    const wrapped = $lazy(() => {
      calls++;
      return inner;
    });
    assert.equal(calls, 0);
    assert.equal(wrapped.parse(1), 1);
    assert.equal(wrapped.parse(2), 2);
    assert.equal(calls, 1);
    assert.equal(wrapped.schema, inner);
  });

  it("walk()は中のスキーマを辿り、自分自身への参照はそこで打ち切る", () => {
    const paths = walk(treeNode).map((f) => f.path.join("."));
    assert.deepEqual(paths, ["value", "children"]);

    const wrapped = $object({ name: $lazy(() => $string({ label: "名前" })) });
    assert.deepEqual(walk(wrapped)[0]?.options, { label: "名前" });
  });
});
