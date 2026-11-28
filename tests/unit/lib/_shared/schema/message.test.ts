import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createI18n } from "../../../../../src/lib/_shared/i18n.ts";
import { formatIssue } from "../../../../../src/lib/_shared/schema/message.ts";
import { $object } from "../../../../../src/lib/_shared/schema/object.ts";
import { $number, $string } from "../../../../../src/lib/_shared/schema/primitives.ts";

const { $t: t } = createI18n("ja", {
  "schema.label": "値",
  "string.required": "{{label}}を入力してください",
  "string.min": "{{label}}は{{min}}文字以上で入力してください",
  "fields.email": "メールアドレス",
  "fields.user": "ユーザー情報",
  "object.required": "{{label}}を入力してください",
});

describe("formatIssue", () => {
  it("issueは文言ではなくkey/paramsを持ち、文言はtで引く", () => {
    const result = $string({ required: true, minLength: 3 }).safeParse("ab");
    assert.ok(!result.success);
    const issue = result.error.issues[0]!;
    assert.equal(issue.code, "min");
    assert.equal(issue.key, "string.min");
    assert.deepEqual(issue.params, { min: 3 });
    assert.equal(formatIssue(issue, t), "値は3文字以上で入力してください");
  });

  it("labelが無ければ主語はschema.labelの文言", () => {
    const result = $string({ required: true }).safeParse(undefined);
    assert.ok(!result.success);
    assert.equal(formatIssue(result.error.issues[0]!, t), "値を入力してください");
  });

  it("labelは文言のキーとして引く", () => {
    const result = $string({ required: true, label: "fields.email" }).safeParse(undefined);
    assert.ok(!result.success);
    assert.deepEqual(result.error.issues[0]!.params, { label: "fields.email" });
    assert.equal(formatIssue(result.error.issues[0]!, t), "メールアドレスを入力してください");
  });

  it("文言にないlabelはそのまま主語にする", () => {
    const result = $string({ required: true, label: "氏名" }).safeParse(undefined);
    assert.ok(!result.success);
    assert.equal(formatIssue(result.error.issues[0]!, t), "氏名を入力してください");
  });

  it("親のlabelは子のissueに付かない", () => {
    const user = $object(
      { email: $string({ required: true, label: "fields.email" }) },
      { required: true, label: "fields.user" },
    );
    const child = user.safeParse({});
    assert.ok(!child.success);
    assert.equal(formatIssue(child.error.issues[0]!, t), "メールアドレスを入力してください");
    const root = user.safeParse(undefined);
    assert.ok(!root.success);
    assert.equal(formatIssue(root.error.issues[0]!, t), "ユーザー情報を入力してください");
  });
});

describe("SchemaError", () => {
  it("messageはissuesのJSONで、issuesに戻せる", () => {
    const schema = $object({
      email: $string({ required: true, minLength: 3 }),
      age: $number({ required: true }),
    });
    const result = schema.safeParse({ email: "ab" });
    assert.ok(!result.success);
    assert.deepEqual(JSON.parse(result.error.message), result.error.issues);
  });
});
