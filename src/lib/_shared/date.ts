/**
 * - ZonedDateTime: 日時
 * - PlainDate: 日付のみ
 * - PlainTime: 時刻のみ
 * 計算と整形はサーバーだけで行い、ブラウザには文字列を渡す。
 * Safariの安定版はTemporalに未対応だが、対応が遅いSafariが悪い（2026-11時点）。
 */

let appTimeZone = "Asia/Tokyo";

export function getAppTimeZone(): string {
  return appTimeZone;
}

export function assertTimeZone(timeZone: string): void {
  Temporal.Now.zonedDateTimeISO(timeZone);
}

export function setAppTimeZone(timeZone: string): void {
  assertTimeZone(timeZone);
  appTimeZone = timeZone;
}

export function today(): Temporal.PlainDate {
  return Temporal.Now.plainDateISO(appTimeZone);
}

export function now(): Temporal.ZonedDateTime {
  return Temporal.Now.zonedDateTimeISO(appTimeZone);
}

export function fromDate(date: Date, timeZone: string = appTimeZone): Temporal.ZonedDateTime {
  return Temporal.Instant.fromEpochMilliseconds(date.getTime()).toZonedDateTimeISO(timeZone);
}

export function toDate(dateTime: Temporal.ZonedDateTime): Date {
  return new Date(dateTime.epochMilliseconds);
}

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const DATE_TIME_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::[0-5]\d(?:\.\d{1,3})?)?$/;
const OFFSET_PATTERN = /(?:Z|[+-]\d{2}:\d{2})$/;
const TIME_PATTERN = /^\d{2}:\d{2}(?::[0-5]\d(?:\.\d{1,3})?)?$/;

export function parseDate(text: string): Temporal.PlainDate | undefined {
  if (!DATE_PATTERN.test(text)) return undefined;
  try {
    return Temporal.PlainDate.from(text, { overflow: "reject" });
  } catch {
    return undefined;
  }
}

export function parseDateTime(text: string, timeZone: string = appTimeZone): Temporal.ZonedDateTime | undefined {
  try {
    if (DATE_TIME_PATTERN.test(text)) {
      // 夏時間で存在しない時刻や2回ある時刻は、Temporalの既定（compatible）に任せて補正する。
      return Temporal.PlainDateTime.from(text, { overflow: "reject" }).toZonedDateTime(timeZone);
    }
    if (DATE_TIME_PATTERN.test(text.replace(OFFSET_PATTERN, ""))) {
      return Temporal.Instant.from(text).toZonedDateTimeISO(timeZone);
    }
  } catch {
    // ignore: 存在しない日時
  }
  return undefined;
}

export function parseTime(text: string): Temporal.PlainTime | undefined {
  if (!TIME_PATTERN.test(text)) return undefined;
  try {
    return Temporal.PlainTime.from(text, { overflow: "reject" });
  } catch {
    return undefined;
  }
}

export function toDateInputValue(date: Temporal.PlainDate): string {
  return date.toString();
}

export function toDateTimeInputValue(dateTime: Temporal.ZonedDateTime): string {
  return dateTime.toPlainDateTime().toString({ smallestUnit: "minute" });
}

export function toTimeInputValue(time: Temporal.PlainTime): string {
  return time.toString({ smallestUnit: "minute" });
}

export function formatDate(date: Temporal.PlainDate): string {
  return date.toLocaleString("ja-JP", { dateStyle: "medium" });
}

export function formatDateTime(dateTime: Temporal.ZonedDateTime): string {
  return dateTime.toLocaleString("ja-JP", { dateStyle: "medium", timeStyle: "short" });
}

export function formatTime(time: Temporal.PlainTime): string {
  return time.toLocaleString("ja-JP", { timeStyle: "short" });
}
