import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { s, type StringType } from "../../../../../src/lib/_shared/schema/index.ts";

describe("string", () => {
  it("指定しなければ任意。undefinedもnullも通る", () => {
    assert.equal(s.string().parse(undefined), undefined);
    assert.equal(s.string().parse(null), null);
  });

  it("文字列を受け付ける", () => {
    assert.equal(s.string({ required: true }).parse("hello"), "hello");
  });

  it("文字列にできない値は拒否する", () => {
    assert.throws(() => s.string({ required: true }).parse({}), /Expected string/);
  });

  it("requiredでundefinedもnullも拒否する", () => {
    assert.throws(() => s.string({ required: true }).parse(undefined), /Required/);
    assert.throws(() => s.string({ required: true }).parse(null), /Required/);
  });

  it("minLength/maxLength", () => {
    const schema = s.string({ minLength: 3, maxLength: 5 });
    assert.equal(schema.safeParse("ab").success, false);
    assert.equal(schema.safeParse("abcdef").success, false);
    assert.equal(schema.safeParse("abc").success, true);
  });

  it("type: email/tel/urlで形式を確認し、issueのcodeはtypeの値になる", () => {
    const cases: [StringType, string[], string[]][] = [
      ["email", ["a@b.com", "first.last+tag@example.co.jp"], ["not-an-email", "a@b", "a @b.com"]],
      ["tel", ["03-1234-5678", "+81 3 1234 5678", "(03) 1234-5678", "09012345678"], ["abc", "-", "03-1234-5678x"]],
      [
        "url",
        ["https://example.com", "http://example.com/path?q=1"],
        ["example.com", "javascript:alert(1)", "ftp://x"],
      ],
    ];
    for (const [type, valid, invalid] of cases) {
      const schema = s.string({ type });
      for (const value of valid) assert.equal(schema.safeParse(value).success, true, `${type} ${value}`);
      for (const value of invalid) {
        const result = schema.safeParse(value);
        assert.ok(!result.success, `${type} ${value}`);
        assert.equal(result.error.issues[0]?.code, type);
      }
    }
  });

  it("patternにg/yフラグは使用不可（lastIndexで結果が変わるため）", () => {
    assert.throws(() => s.string({ pattern: /^a+$/g }), /g\/yフラグ/);
    assert.throws(() => s.string({ pattern: /^a+$/y }), /g\/yフラグ/);
  });

  it("telは全角を半角に変換して検証し、変換後の値を返す", () => {
    assert.equal(s.string({ type: "tel" }).parse("０３−１２３４−５６７８"), "03-1234-5678");
  });

  it("typeとpatternは両方効く", () => {
    const corporate = s.string({ type: "email", pattern: /@example\.com$/ });
    assert.equal(corporate.safeParse("a@example.com").success, true);
    assert.equal(corporate.safeParse("a@other.com").success, false);
  });

  it("サロゲートペアは1文字に数える", () => {
    assert.equal(s.string({ length: 2 }).safeParse("😀😀").success, true);
    assert.equal(s.string({ length: 4 }).safeParse("😀😀").success, false);
  });

  it("結合文字は1文字に数える", () => {
    const combining = "é";
    assert.equal(s.string({ length: 1 }).safeParse(combining).success, true);
    assert.equal(s.string({ minLength: 2 }).safeParse(combining).success, false);
  });

  it("前後の空白は取り除く。trim: falseなら残す", () => {
    assert.equal(s.string().parse("  a  "), "a");
    assert.equal(s.string({ trim: false }).parse("  a  "), "  a  ");
  });

  it("空文字は値が無い（null）として扱い、requiredならrequiredのissueになる", () => {
    assert.equal(s.string().parse(""), null);
    assert.equal(s.string().parse("   "), null);
    assert.equal(s.string({ trim: false }).parse("   "), null);
    const result = s.string({ required: true }).safeParse("");
    assert.ok(!result.success);
    assert.equal(result.error.issues[0]?.code, "required");
  });

  it("strictでも空文字はnullにし、前後の空白も取り除く", () => {
    assert.equal(s.string({ strict: true }).parse(""), null);
    assert.throws(() => s.string({ required: true, strict: true }).parse(""), /Required/);
    assert.equal(s.string({ strict: true }).parse("  a  "), "a");
  });

  it("allowEmptyなら空文字を値として受け付ける", () => {
    assert.equal(s.string({ required: true, allowEmpty: true }).parse(""), "");
    assert.equal(s.string({ required: true, allowEmpty: true }).parse("  "), "");
    assert.equal(s.string({ required: true, allowEmpty: true, trim: false }).parse("  "), "  ");
  });

  it("number/booleanは文字列にする。strictなら拒否する", () => {
    assert.equal(s.string().parse(42), "42");
    assert.equal(s.string().parse(true), "true");
    assert.equal(s.string({ minLength: 3 }).safeParse(42).success, false);
    assert.equal(s.string({ strict: true }).safeParse(42).success, false);
  });
});

describe("number", () => {
  it("数値を受け付ける", () => {
    assert.equal(s.number().parse(3.14), 3.14);
  });

  it("NaN/Infinity/数値にできない文字列は拒否する", () => {
    assert.throws(() => s.number({ required: true }).parse(Number.NaN), /Expected number/);
    assert.throws(() => s.number({ required: true }).parse(Number.POSITIVE_INFINITY), /Expected number/);
    assert.throws(() => s.number({ required: true }).parse("not-a-number"), /Expected number/);
  });

  it("type: int / min / max / sign", () => {
    assert.equal(s.number({ type: "int" }).safeParse(1.5).success, false);
    assert.equal(s.number({ min: 0, max: 10 }).safeParse(11).success, false);
    assert.equal(s.number({ sign: "positive" }).safeParse(-1).success, false);
    assert.equal(s.number({ sign: "negative" }).safeParse(1).success, false);
    assert.equal(s.number({ sign: "nonnegative" }).safeParse(0).success, true);
  });

  it("decimals", () => {
    assert.equal(s.number({ decimals: 2 }).safeParse(1.23).success, true);
    assert.equal(s.number({ decimals: 2 }).safeParse(1.234).success, false);
    assert.equal(s.number({ decimals: 0 }).safeParse(5).success, true);
    assert.equal(s.number({ decimals: 2 }).safeParse(1.2e-7).success, false);
  });

  it("全角の数字と記号を半角に変換し、桁区切りのカンマを除去する", () => {
    assert.equal(s.number().parse("１，２３４．５"), 1234.5);
    assert.equal(s.number().parse("−１"), -1);
    assert.equal(s.number().parse("ー1"), -1);
  });

  it("10進の数字の文字列だけを数値にする", () => {
    assert.equal(s.number().parse("1"), 1);
    assert.equal(s.number().parse(" -1.5 "), -1.5);
    assert.equal(s.number({ type: "int" }).safeParse("1.5").success, false);
    for (const text of ["0x10", "1e3", "Infinity", "1 000"]) {
      assert.equal(s.number().safeParse(text).success, false, text);
    }
  });

  it("空文字は値が無い（null）として扱う。defaultはundefinedにしか効かない", () => {
    assert.equal(s.number().parse(""), null);
    assert.equal(s.number().parse("  "), null);
    assert.equal(s.number({ default: 10 }).parse(""), null);
    assert.throws(() => s.number({ required: true }).parse(""), /Required/);
  });

  it("strictなら文字列を拒否する", () => {
    assert.equal(s.number({ strict: true }).safeParse("1").success, false);
  });
});

describe("boolean", () => {
  it("真偽値を受け付ける", () => {
    assert.equal(s.boolean({ required: true }).parse(true), true);
    assert.throws(() => s.boolean({ required: true }).parse("yes"));
  });

  it("true/false/on/offの文字列を真偽値にする（大文字小文字を問わない）", () => {
    assert.equal(s.boolean().parse("true"), true);
    assert.equal(s.boolean().parse("FALSE"), false);
    assert.equal(s.boolean().parse("On"), true);
    assert.equal(s.boolean().parse("off"), false);
    assert.throws(() => s.boolean({ required: true }).parse("1"));
  });

  it("空文字は値が無い（null）として扱う", () => {
    assert.equal(s.boolean().parse(""), null);
    assert.throws(() => s.boolean({ required: true }).parse(""), /Required/);
  });

  it("チェックボックスを外すとプロパティが存在しないため、default: falseで補う", () => {
    assert.equal(s.boolean({ required: true, default: false }).parse(undefined), false);
  });

  it("required: { disallowFalse: true }はfalseも拒否する（同意のチェックボックス）", () => {
    const agreed = s.boolean({ required: { disallowFalse: true } });
    assert.equal(agreed.parse("on"), true);
    for (const input of [false, "off", undefined, ""]) {
      const result = agreed.safeParse(input);
      assert.ok(!result.success, String(input));
      assert.equal(result.error.issues[0]?.code, "required");
    }
  });

  it("strictなら文字列を拒否する", () => {
    assert.equal(s.boolean({ strict: true }).safeParse("true").success, false);
  });
});

describe("date", () => {
  it("YYYY-MM-DDの文字列をPlainDateにする", () => {
    assert.equal(s.date().parse("2024-01-15")?.toString(), "2024-01-15");
    const d = Temporal.PlainDate.from("2024-01-15");
    assert.equal(s.date({ required: true }).parse(d), d);
  });

  it("存在しない日付と、日付だけでない形式は拒否する", () => {
    for (const text of ["2024-02-30", "2024-13-01", "2024-01-15T09:30", "2024/01/15", "Jan 15 2024", "20240115"]) {
      assert.equal(s.date().safeParse(text).success, false, text);
    }
    assert.equal(s.date().safeParse("2000-02-29").success, true);
    assert.equal(s.date().safeParse("1900-02-29").success, false);
  });

  it("空文字は値が無い（null）として扱う", () => {
    assert.equal(s.date().parse(""), null);
    assert.throws(() => s.date({ required: true }).parse(""), /Required/);
  });

  it("min/maxは暦の日付で比較する", () => {
    const schema = s.date({ min: Temporal.PlainDate.from("2024-01-01"), max: Temporal.PlainDate.from("2024-12-31") });
    assert.equal(schema.safeParse("2023-12-31").success, false);
    assert.equal(schema.safeParse("2024-01-01").success, true);
    assert.equal(schema.safeParse("2024-12-31").success, true);
    assert.equal(schema.safeParse("2025-01-01").success, false);
  });

  it("strictなら文字列を拒否する", () => {
    assert.equal(s.date({ strict: true }).safeParse("2024-01-15").success, false);
  });
});

describe("datetime", () => {
  it("タイムゾーン無しの文字列はアプリのタイムゾーン（既定はAsia/Tokyo）の日時にする", () => {
    const parsed = s.datetime().parse("2024-01-15T09:30");
    assert.equal(parsed?.toString(), "2024-01-15T09:30:00+09:00[Asia/Tokyo]");
    assert.equal(
      s.datetime({ timeZone: "UTC" }).parse("2024-01-15T09:30")?.toString(),
      "2024-01-15T09:30:00+00:00[UTC]",
    );
  });

  it("Zやオフセット付きの文字列はその時刻として扱い、アプリのタイムゾーンに変換する", () => {
    assert.equal(s.datetime().parse("2024-01-15T00:00:00Z")?.toString(), "2024-01-15T09:00:00+09:00[Asia/Tokyo]");
    assert.equal(
      s.datetime().parse("2024-01-15T09:00:00+09:00")?.epochMilliseconds,
      Date.parse("2024-01-15T00:00:00Z"),
    );
  });

  it("DBのtimestamptz（Date）とInstantも受け付ける", () => {
    const date = new Date("2024-01-15T00:00:00Z");
    assert.equal(s.datetime().parse(date)?.toString(), "2024-01-15T09:00:00+09:00[Asia/Tokyo]");
    assert.equal(s.datetime().parse(Temporal.Instant.from("2024-01-15T00:00:00Z"))?.hour, 9);
  });

  it("存在しない日時と、日付だけの形式は拒否する", () => {
    for (const text of ["2024-02-30T00:00", "2024-01-15T24:00", "2024-01-15", "2024/01/15 09:30"]) {
      assert.equal(s.datetime().safeParse(text).success, false, text);
    }
  });

  it("min/max", () => {
    const schema = s.datetime({ min: Temporal.ZonedDateTime.from("2024-01-15T09:00[Asia/Tokyo]") });
    assert.equal(schema.safeParse("2024-01-15T08:59").success, false);
    assert.equal(schema.safeParse("2024-01-15T09:00").success, true);
    const result = schema.safeParse("2024-01-15T08:59");
    assert.ok(!result.success);
    assert.deepEqual(result.error.issues[0]?.params, { min: "2024-01-15T09:00:00" });
  });

  it("min/maxで別のタイムゾーンが指定されていた場合でも、メッセージはスキーマのタイムゾーンを出力する", () => {
    const schema = s.datetime({ min: Temporal.ZonedDateTime.from("2024-01-15T00:00[UTC]") });
    assert.equal(schema.safeParse("2024-01-15T08:59").success, false);
    assert.equal(schema.safeParse("2024-01-15T09:00").success, true);
    const result = schema.safeParse("2024-01-15T08:59");
    assert.ok(!result.success);
    assert.deepEqual(result.error.issues[0]?.params, { min: "2024-01-15T09:00:00" });
  });

  it("timeZoneに存在しないIDを指定すると、スキーマを作る時点でRangeErrorになる", () => {
    assert.throws(() => s.datetime({ timeZone: "Tokyo" }), RangeError);
  });

  it("60秒の指定はエラー", () => {
    assert.equal(s.datetime().safeParse("2024-01-15T09:30:60").success, false);
  });
});

describe("time", () => {
  it("HH:mm[:ss]の文字列をPlainTimeにする", () => {
    assert.equal(s.time().parse("09:30")?.toString(), "09:30:00");
    assert.equal(s.time().parse("09:30:15")?.second, 15);
  });

  it("存在しない時刻と想定外の形式は拒否する", () => {
    for (const text of ["24:00", "09:60", "9:30", "0930", "2024-01-15T09:30"]) {
      assert.equal(s.time().safeParse(text).success, false, text);
    }
  });

  it("min/max", () => {
    const schema = s.time({ min: Temporal.PlainTime.from("09:00"), max: Temporal.PlainTime.from("18:00") });
    assert.equal(schema.safeParse("08:59").success, false);
    assert.equal(schema.safeParse("18:00").success, true);
    assert.equal(schema.safeParse("18:01").success, false);
  });

  it("min/maxの文言は秒を落とさない", () => {
    const result = s.time({ min: Temporal.PlainTime.from("09:30:30") }).safeParse("09:30:10");
    assert.ok(!result.success);
    assert.deepEqual(result.error.issues[0]?.params, { min: "09:30:30" });
  });
});

describe("literal / enum", () => {
  it("literal", () => {
    assert.equal(s.literal("admin", { required: true }).parse("admin"), "admin");
    assert.throws(() => s.literal("admin", { required: true }).parse("user"));
  });

  it("enum", () => {
    const role = s.enum(["admin", "user", "guest"], { required: true });
    assert.equal(role.parse("user"), "user");
    assert.throws(() => role.parse("root"));
  });

  it('空文字は値が無い（null）として扱う。選択肢に""があれば値として受け付ける', () => {
    assert.equal(s.literal("admin").parse(""), null);
    assert.equal(s.enum(["admin", "user"]).parse(""), null);
    assert.throws(() => s.enum(["admin", "user"], { required: true }).parse(""), /Required/);
    assert.equal(s.enum(["", "admin"], { required: true }).parse(""), "");
  });
});

describe("共通オプション", () => {
  it("required: { nullable: true }はnullだけを通す。空文字もnullになるので通る", () => {
    const schema = s.string({ required: { nullable: true } });
    assert.equal(schema.parse(null), null);
    assert.equal(schema.parse(""), null);
    assert.throws(() => schema.parse(undefined), /Required/);
  });

  it("defaultはundefinedのときだけ適用する", () => {
    const schema = s.number({ default: 10 });
    assert.equal(schema.parse(undefined), 10);
    assert.equal(schema.parse(5), 5);
  });

  it("refineで独自の検証を足せる", () => {
    const even = s.number({ required: true, refine: (n) => n % 2 !== 0 && { code: "even" } });
    assert.equal(even.safeParse(3).success, false);
    assert.equal(even.parse(4), 4);
  });

  it("refineは複数のissueを返せる", () => {
    const schema = s.number({
      required: true,
      refine: (n) => {
        const issues = [];
        if (n % 2 !== 0) issues.push({ code: "even" });
        if (n <= 0) issues.push({ code: "positive" });
        return issues;
      },
    });
    const result = schema.safeParse(-3);
    assert.ok(!result.success);
    assert.deepEqual(
      result.error.issues.map((i) => i.code),
      ["even", "positive"],
    );
    assert.ok(result.error.issues.every((i) => i.type === "error"));
  });

  it("refineのissueのtypeをwarning/infoにすると、失敗させずに結果に添えられる", () => {
    const schema = s.number({
      required: true,
      refine: (n) => (n > 100 ? { code: "large", type: "warning" as const } : undefined),
    });
    const result = schema.safeParse(200);
    assert.ok(result.success);
    assert.equal(result.data, 200);
    assert.equal(result.issues?.[0]?.code, "large");
    assert.equal(result.issues?.[0]?.type, "warning");
  });
});
