import {
  createI18n,
  DEFAULT_LOCALE,
  localeFromAcceptLanguage,
  toLocale,
  type I18n,
  type I18nAddon,
  type Locale,
  type Messages,
} from "../lib/_shared/i18n.ts";
import { listAssets } from "./assets.ts";
import { readCookie } from "./cookie.ts";
import { slot } from "./slot.ts";

export const LOCALE_COOKIE_NAME = "lang";

const I18N_ASSET = /^locales\/([^/.]+)(?:\.([^/.]+))?\.json$/;

const BASE = "";

type Resource = {
  readonly url: string;
  readonly messages: Messages;
};

function loadResources(): Map<string, Map<string, Resource>> {
  const resources = new Map<string, Map<string, Resource>>();
  for (const { name, body, url } of listAssets()) {
    const [, locale, addon = BASE] = I18N_ASSET.exec(name) ?? [];
    if (locale == null) continue;
    let localeResources = resources.get(locale);
    if (localeResources == null) {
      localeResources = new Map();
      resources.set(locale, localeResources);
    }
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion
    localeResources.set(addon, { url, messages: JSON.parse(body.toString()) as Messages });
  }
  return resources;
}

const resources = loadResources();

export type RequestI18n = I18n & {
  readonly urls: readonly string[];
};

const resolved = new Map<string, RequestI18n>();

function createRequestI18n(locale: Locale, addons: readonly I18nAddon[]): RequestI18n {
  const messages: Record<string, string> = {};
  const urls: string[] = [];
  for (const addon of new Set([BASE, ...addons])) {
    const found = resources.get(locale)?.get(addon);
    if (found == null) continue;
    Object.assign(messages, found.messages);
    urls.push(found.url);
  }
  return { ...createI18n(locale, messages), urls };
}

/**
 * リクエストの言語を、Cookie > Accept-Language > ヘッダー > 既定の言語の順に決める。
 */
export function resolveI18n(req: Request, addons: readonly I18nAddon[]): RequestI18n {
  const locale =
    toLocale(readCookie(req, LOCALE_COOKIE_NAME) ?? "") ??
    localeFromAcceptLanguage(req.headers.get("accept-language") ?? "") ??
    DEFAULT_LOCALE;
  const key = [locale, ...addons].join("\n");
  let i18n = resolved.get(key);
  if (i18n == null) {
    i18n = createRequestI18n(locale, addons);
    resolved.set(key, i18n);
  }
  return i18n;
}

export const i18nSlot = slot<RequestI18n>("i18n");
