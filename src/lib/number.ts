import { toHalfWidth, toHyphen } from "./string.ts";

// Number()は"0x10"や"1e3"や"Infinity"も数値にするため、10進数だけを通す。
// カンマは3桁ごとの桁区切りの位置だけ許容する。
const DECIMAL_PATTERN = /^[+-]?(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?$/;

export function parseNumber(text: string): number | undefined {
  const normalized = toHyphen(toHalfWidth(text)).trim();
  if (!DECIMAL_PATTERN.test(normalized)) return undefined;
  return Number(normalized.replace(/,/g, ""));
}

export function formatNumber(value: number, decimals?: number): string {
  return value.toLocaleString(
    "ja-JP",
    decimals == null ? {} : { minimumFractionDigits: decimals, maximumFractionDigits: decimals },
  );
}
