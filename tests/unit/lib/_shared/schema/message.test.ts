import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import {
  s,
  formatIssue,
  formatIssues,
  jaMessages,
  jaFormMessages,
  enMessages,
  setDefaultMessages,
  getDefaultMessages,
  resolveLabel,
  resolveLabels,
} from "../../../../../src/lib/_shared/schema/index.ts";

describe("メッセージ", () => {
  afterEach(() => {
    setDefaultMessages(enMessages);
  });

  it("issueは文言ではなくkey/paramsを持つ", () => {
    const result = s.string({ required: true, minLength: 3 }).safeParse("ab");
    assert.ok(!result.success);
    const issue = result.error.issues[0]!;
    assert.equal(issue.code, "min");
    assert.equal(issue.key, "string.min");
    assert.deepEqual(issue.params, { min: 3 });
    assert.equal(formatIssue(issue), "String must contain at least 3 character(s)");
  });

  it("辞書を差し替えられる", () => {
    const result = s.string({ required: true, minLength: 3 }).safeParse("ab");
    assert.ok(!result.success);
    const ja = formatIssues(result.error.issues, { "string.min": (p) => `${String(p.min)}文字以上入力してください` });
    assert.equal(ja, "(root): 3文字以上入力してください");
    assert.equal(formatIssue(result.error.issues[0]!, jaMessages), "文字列は 3 文字以上である必要があります");
  });

  it("既定の辞書を切り替えられる", () => {
    assert.equal(getDefaultMessages(), enMessages);
    setDefaultMessages(jaMessages);
    const result = s.string({ required: true, minLength: 3 }).safeParse("ab");
    assert.ok(!result.success);
    assert.equal(formatIssue(result.error.issues[0]!), "文字列は 3 文字以上である必要があります");
    assert.equal(result.error.message, "(root): 文字列は 3 文字以上である必要があります");
  });
});

const translate = (key: string) => ({ "fields.email": "メールアドレス" })[key] ?? key;

describe("label", () => {
  it("labelが無ければ主語は「値」", () => {
    const result = s.string({ required: true }).safeParse(undefined);
    assert.ok(!result.success);
    assert.equal(formatIssue(result.error.issues[0]!, jaFormMessages), "値を入力してください");
  });

  it("labelがあればそれを主語にする", () => {
    const result = s.string({ required: true, label: "メールアドレス" }).safeParse(undefined);
    assert.ok(!result.success);
    assert.deepEqual(result.error.issues[0]!.params, { label: "メールアドレス" });
    assert.equal(formatIssue(result.error.issues[0]!, jaFormMessages), "メールアドレスを入力してください");
  });

  it("親のlabelは子のissueに付かない", () => {
    const user = s.object(
      { email: s.string({ required: true, label: "メールアドレス" }) },
      { required: true, label: "ユーザー情報" },
    );
    const child = user.safeParse({});
    assert.ok(!child.success);
    assert.equal(formatIssue(child.error.issues[0]!, jaFormMessages), "メールアドレスを入力してください");
    const root = user.safeParse(undefined);
    assert.ok(!root.success);
    assert.equal(formatIssue(root.error.issues[0]!, jaFormMessages), "ユーザー情報を入力してください");
  });

  it("resolveLabelでparams.labelをキーから表示名に変換する", () => {
    const result = s.string({ required: true, label: "fields.email" }).safeParse(undefined);
    assert.ok(!result.success);
    const resolved = resolveLabel(result.error.issues[0]!, translate);
    assert.equal(resolved.params.label, "メールアドレス");
    assert.equal(formatIssue(resolved, jaFormMessages), "メールアドレスを入力してください");
  });

  it("labelの無いissueはそのまま返す", () => {
    const result = s.string({ required: true }).safeParse(undefined);
    assert.ok(!result.success);
    const issue = result.error.issues[0]!;
    assert.equal(resolveLabel(issue, translate), issue);
  });

  it("resolveLabelsで一括変換する", () => {
    const schema = s.object({
      email: s.string({ required: true, label: "fields.email" }),
      age: s.number({ required: true }),
    });
    const result = schema.safeParse({});
    assert.ok(!result.success);
    const resolved = resolveLabels(result.error.issues, translate);
    assert.equal(
      formatIssues(resolved, jaFormMessages),
      "email: メールアドレスを入力してください; age: 値を入力してください",
    );
  });
});
