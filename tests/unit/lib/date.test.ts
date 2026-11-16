import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  formatDate,
  formatDateTime,
  formatTime,
  fromDate,
  getAppTimeZone,
  parseDate,
  parseDateTime,
  parseTime,
  setAppTimeZone,
  toDate,
  toDateInputValue,
  toDateTimeInputValue,
  toTimeInputValue,
} from "../../../src/lib/date.ts";

describe("アプリのタイムゾーン", () => {
  it("既定はAsia/Tokyoで、設定すれば変わる。不正なIDは例外とする", (t) => {
    t.after(() => setAppTimeZone("Asia/Tokyo"));
    assert.equal(getAppTimeZone(), "Asia/Tokyo");
    setAppTimeZone("UTC");
    assert.equal(getAppTimeZone(), "UTC");
    assert.throws(() => setAppTimeZone("Tokyo"), RangeError);
    assert.equal(getAppTimeZone(), "UTC");
  });
});

describe("parseDate", () => {
  it("YYYY-MM-DDだけを受け付け、存在しない日付はundefined", () => {
    assert.equal(parseDate("2024-02-29")?.toString(), "2024-02-29");
    assert.equal(parseDate("2023-02-29"), undefined);
    assert.equal(parseDate("2024-1-5"), undefined);
    assert.equal(parseDate("2024-01-15T09:30"), undefined);
  });
});

describe("parseDateTime", () => {
  it("タイムゾーン無しは指定のタイムゾーン（既定はアプリ）の時刻として扱う", () => {
    assert.equal(parseDateTime("2024-01-15T09:30")?.toString(), "2024-01-15T09:30:00+09:00[Asia/Tokyo]");
    assert.equal(parseDateTime("2024-01-15T09:30:15.5")?.millisecond, 500);
    assert.equal(parseDateTime("2024-01-15T09:30", "UTC")?.toString(), "2024-01-15T09:30:00+00:00[UTC]");
  });

  it("Zやオフセット付きはその時刻として扱い、指定のタイムゾーンに変換する", () => {
    assert.equal(parseDateTime("2024-01-15T00:00:00Z")?.toString(), "2024-01-15T09:00:00+09:00[Asia/Tokyo]");
    assert.equal(parseDateTime("2024-01-15T00:00:00.000+09:00")?.toString(), "2024-01-15T00:00:00+09:00[Asia/Tokyo]");
  });

  it("存在しない日時と想定外の形式はundefinedにする", () => {
    for (const text of [
      "2024-02-30T00:00",
      "2024-01-15T24:00",
      "2024-01-15",
      "2024-01-15 09:30",
      "2024-01-15T09:30[Asia/Tokyo]",
    ]) {
      assert.equal(parseDateTime(text), undefined, text);
    }
  });
});

describe("parseTime", () => {
  it("HH:mm[:ss]だけを受け付ける", () => {
    assert.equal(parseTime("09:30")?.toString(), "09:30:00");
    assert.equal(parseTime("23:59:59")?.second, 59);
    assert.equal(parseTime("24:00"), undefined);
    assert.equal(parseTime("09:30:60"), undefined);
    assert.equal(parseTime("9:30"), undefined);
  });
});

describe("Dateとの互換性", () => {
  it("fromDateはアプリのタイムゾーンの日時／toDateは同じ瞬間のDate", () => {
    const date = new Date("2024-01-15T00:00:00Z");
    const zoned = fromDate(date);
    assert.equal(zoned.toString(), "2024-01-15T09:00:00+09:00[Asia/Tokyo]");
    assert.equal(toDate(zoned).getTime(), date.getTime());
  });
});

describe("inputのvalue", () => {
  it("date/datetime-local/timeのvalueの形式にする", () => {
    assert.equal(toDateInputValue(Temporal.PlainDate.from("2024-01-05")), "2024-01-05");
    assert.equal(
      toDateTimeInputValue(Temporal.ZonedDateTime.from("2024-01-05T09:30:15[Asia/Tokyo]")),
      "2024-01-05T09:30",
    );
    assert.equal(toTimeInputValue(Temporal.PlainTime.from("09:30:15")), "09:30");
  });
});

describe("日付整形", () => {
  it("YYYY/MM/DD h:mm", () => {
    assert.equal(formatDate(Temporal.PlainDate.from("2024-01-05")), "2024/01/05");
    assert.equal(formatDateTime(Temporal.ZonedDateTime.from("2024-01-05T09:30[Asia/Tokyo]")), "2024/01/05 9:30");
    assert.equal(formatTime(Temporal.PlainTime.from("09:30")), "9:30");
  });
});
