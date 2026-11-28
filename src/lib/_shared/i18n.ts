import type { I18nTexts } from "./i18n-texts.ts";

export type { I18nAddon } from "./i18n-texts.ts";

export const SUPPORTED_LOCALES = ["ja", "en"] as const;

export type Locale = (typeof SUPPORTED_LOCALES)[number];

export const DEFAULT_LOCALE: Locale = "ja";

export type Messages = Readonly<Record<string, string>>;
export type MessageParams = Readonly<Record<string, unknown>>;

export type I18nKey = keyof I18nTexts;

export type Translate = <K extends I18nKey>(
  key: K,
  ...params: [I18nTexts[K]] extends [never] ? [] : [params: Readonly<Record<I18nTexts[K], unknown>>]
) => string;
export type TranslateDynamic = (key: string, params?: MessageParams) => string;

export type I18n = {
  readonly locale: Locale;
  readonly t: Translate;
  readonly $t: TranslateDynamic;
};

/**
 * 追加の言語リソース（<言語>.<addon>.json）の文言を、引くときのキー（<addon>.<ファイル中のキー>）に直す。
 */
export function withAddonPrefix(addon: string, messages: Messages): Messages {
  return Object.fromEntries(Object.entries(messages).map(([key, text]) => [`${addon}.${key}`, text]));
}

const PLACEHOLDER = /\{\{(\w+)\}\}/g;

/**
 * @returns text 中の {{名前}} の名前。同じ名前が複数あれば、その数だけ含む。
 */
export function placeholderNames(text: string): string[] {
  return [...text.matchAll(PLACEHOLDER)].map(([, name = ""]) => name);
}

/**
 * @param messages locale の文言。
 */
export function createI18n(locale: Locale, messages: Messages): I18n {
  const translateDynamic: TranslateDynamic = (key, params) => {
    // プロトタイプ鎖の値（constructor など）を文言として読まない。
    const text = Object.hasOwn(messages, key) ? messages[key] : undefined;
    if (text == null) return key;
    if (params == null) return text;
    return text.replace(PLACEHOLDER, (placeholder, name: string) => {
      const value = Object.hasOwn(params, name) ? params[name] : undefined;
      // oxlint-disable-next-line typescript/no-base-to-string -- 値には、数値や日時など文字列に直せるものを渡す。
      return value == null ? placeholder : String(value);
    });
  };
  return { locale, t: translateDynamic, $t: translateDynamic };
}

/**
 * 言語タグ（"en-US" など）を、対応している言語に直す。
 * 地域などの違いは無視し、言語の部分だけで決める。
 *
 * @returns 対応していない言語なら undefined。
 */
export function toLocale(tag: string): Locale | undefined {
  const language = tag.trim().toLowerCase().split("-")[0];
  return SUPPORTED_LOCALES.find((locale) => locale === language);
}

// 送られてきたヘッダーをいくらでも処理しないよう、見る件数を限る。
const MAX_LANGUAGE_RANGES = 10;

/**
 * Accept-Language ヘッダーの値から、優先度が最も高い対応言語を選ぶ。
 *
 * @returns 対応している言語が含まれていなければ undefined。
 */
export function localeFromAcceptLanguage(header: string): Locale | undefined {
  const ranges = header.split(",", MAX_LANGUAGE_RANGES).map((range) => {
    const [tag = "", ...params] = range.split(";");
    const q = params.map((param) => param.trim()).find((param) => param.startsWith("q="));
    return { tag, q: q == null ? 1 : Number(q.slice(2)) || 0 };
  });
  // sort は安定なので、優先度が同じなら先に書かれたものが先に残る。
  ranges.sort((a, b) => b.q - a.q);
  for (const { tag, q } of ranges) {
    const locale = q > 0 ? toLocale(tag) : undefined;
    if (locale != null) return locale;
  }
  return undefined;
}
