import { createI18n, DEFAULT_LOCALE, toLocale, type I18n, type Messages } from "../../lib/_shared/i18n.ts";

async function fetchMessages(url: string): Promise<Messages> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`言語リソースの取得に失敗しました: ${url} (${res.status})`);
  }
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion
  return (await res.json()) as Messages;
}

async function load(): Promise<I18n> {
  const root = document.documentElement;
  const urls = [...document.querySelectorAll<HTMLMetaElement>('meta[name="i18n"]')].map((meta) => meta.content);
  const messages: Record<string, string> = {};
  for (const resource of await Promise.all(urls.map(fetchMessages))) {
    Object.assign(messages, resource);
  }
  return createI18n(toLocale(root.lang) ?? DEFAULT_LOCALE, messages);
}

const LOADING = Symbol.for("app.i18n");

type Shared = { [LOADING]?: Promise<I18n> };

export function loadI18n(): Promise<I18n> {
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion
  const shared = globalThis as Shared;
  shared[LOADING] ??= load();
  return shared[LOADING];
}
