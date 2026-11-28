import { globSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { build } from "esbuild";
import { basename, dirname, join, relative } from "node:path";
import { DEFAULT_LOCALE, SUPPORTED_LOCALES, withAddonPrefix } from "../src/lib/_shared/i18n.ts";

const OUT_DIR = "dist/public";

const entryPoints = globSync(["src/features/**/_client/*.{ts,css}", "src/components/**/_client/*.{ts,css}"]).map(
  (file) => {
    return {
      in: file,
      out: relative("src", file)
        .replace(/(^|\/)_client\//, "$1")
        .replace(/\.(ts|css)$/, ""),
    };
  },
);

// 検査を通るまで dist/public/ に書き出さない。サーバーのコードを含むバンドルが配信されないようにする。
const result = await build({
  entryPoints,
  bundle: true,
  minify: true,
  format: "esm",
  platform: "browser",
  target: "es2022",
  outdir: OUT_DIR,
  metafile: true,
  write: false,
  logLevel: "info",
});

const CLIENT_DIRECTORY = /(^|\/)_(?:client|shared)\//;
const violations = Object.keys(result.metafile.inputs).filter((input) => !CLIENT_DIRECTORY.test(input));

if (violations.length > 0) {
  console.error(`対象外のファイルがバンドルに含まれています:\n${violations.join("\n")}`);
  process.exit(1);
}

type I18nFile = {
  readonly file: string;
  readonly messages: Readonly<Record<string, string>>;
};

function isMessages(value: unknown): value is Readonly<Record<string, string>> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    Object.values(value).every((text) => typeof text === "string")
  );
}

// <lang>.json は、ファイル中のキーのまま引く。<lang>.<addon>.json は、<addon>.<key> で引く。
const I18N_FILE = /^([^.]+)(?:\.([^.]+))?\.json$/;

function loadI18nResources(errors: string[], gaps: string[]): I18nFile[] {
  const resources = new Map<string, Map<string, I18nFile>>();
  for (const file of globSync("locales/*").toSorted()) {
    const [, locale, addon] = I18N_FILE.exec(basename(file)) ?? [];
    if (locale == null || !SUPPORTED_LOCALES.some((supported) => supported === locale)) {
      errors.push(`${file}: 対応していない言語が指定されています: ${locale ?? basename(file)}`);
      continue;
    }
    const messages: unknown = JSON.parse(readFileSync(file, "utf8"));
    if (!isMessages(messages)) {
      errors.push(`${file}: 言語ファイルのフォーマットが不正です。`);
      continue;
    }
    const name = addon == null ? "locales/*.json" : `locales/*.${addon}.json`;
    let resource = resources.get(name);
    if (resource == null) {
      resource = new Map();
      resources.set(name, resource);
    }
    resource.set(locale, { file, messages: addon == null ? messages : withAddonPrefix(addon, messages) });
  }

  const files: I18nFile[] = [];
  for (const [name, resource] of resources) {
    const base = resource.get(DEFAULT_LOCALE);
    for (const locale of SUPPORTED_LOCALES) {
      const current = resource.get(locale);
      if (current == null) {
        gaps.push(`${name}: ${locale} のファイルが存在しません。`);
        continue;
      }
      files.push(current);
      if (base == null) continue;
      const missing = Object.keys(base.messages).filter((key) => !Object.hasOwn(current.messages, key));
      const extra = Object.keys(current.messages).filter((key) => !Object.hasOwn(base.messages, key));
      for (const key of missing) gaps.push(`${current.file}: キーが存在しません: ${key}`);
      for (const key of extra) gaps.push(`${current.file}: ${DEFAULT_LOCALE} のファイルに存在しないキーです: ${key}`);
    }
  }
  return files;
}

const i18nErrors: string[] = [];
const i18nGaps: string[] = [];
const i18nFiles = loadI18nResources(i18nErrors, i18nGaps);

if (process.argv.includes("--allow-missing-locales")) {
  if (i18nGaps.length > 0) {
    console.warn(`言語リソースに過不足があります:\n${i18nGaps.join("\n")}`);
  }
} else {
  i18nErrors.push(...i18nGaps);
}

if (i18nErrors.length > 0) {
  console.error(`言語リソースに誤りがあります:\n${i18nErrors.join("\n")}`);
  process.exit(1);
}

for (const file of result.outputFiles) {
  mkdirSync(dirname(file.path), { recursive: true });
  writeFileSync(file.path, file.contents);
}

for (const { file, messages } of i18nFiles) {
  const path = join(OUT_DIR, file);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(messages));
}
