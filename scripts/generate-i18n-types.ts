/**
 * locales/ の言語リソースから、文言のキーの型（src/lib/_shared/i18n-texts.ts）を生成する。
 *   node scripts/generate-i18n-types.ts          生成する。
 *   node scripts/generate-i18n-types.ts --check  生成済みのファイルが locales/ と合っているかを確かめる。
 */

import { existsSync, globSync, readFileSync, writeFileSync } from "node:fs";
import { basename } from "node:path";
import { placeholderNames, withAddonPrefix } from "../src/lib/_shared/i18n.ts";

const OUT_FILE = "src/lib/_shared/i18n-texts.ts";

// <lang>.json は、ファイル中のキーのまま引く。
// <lang>.<addon>.json は、<addon>.<key> で引く。
const I18N_FILE = /^[^.]+(?:\.([^.]+))?\.json$/;

const texts = new Map<string, Set<string>>();
const addons = new Set<string>();
for (const file of globSync("locales/*").toSorted()) {
  const matched = I18N_FILE.exec(basename(file));
  if (matched == null) continue;
  const messages: unknown = JSON.parse(readFileSync(file, "utf8"));
  if (typeof messages !== "object" || messages === null || Array.isArray(messages)) continue;
  const strings: Record<string, string> = {};
  for (const [key, text] of Object.entries(messages)) {
    if (typeof text === "string") strings[key] = text;
  }
  const addon = matched[1];
  if (addon != null) addons.add(addon);
  for (const [key, text] of Object.entries(addon == null ? strings : withAddonPrefix(addon, strings))) {
    let names = texts.get(key);
    if (names == null) {
      names = new Set();
      texts.set(key, names);
    }
    for (const name of placeholderNames(text)) names.add(name);
  }
}

const lines = [...texts]
  .toSorted(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
  .map(([key, names]) => {
    const type =
      names.size === 0
        ? "never"
        : [...names]
            .toSorted()
            .map((name) => JSON.stringify(name))
            .join(" | ");
    return `  ${JSON.stringify(key)}: ${type};`;
  });

const addonType =
  addons.size === 0
    ? "never"
    : [...addons]
        .toSorted()
        .map((addon) => JSON.stringify(addon))
        .join(" | ");

const output = `// scripts/generate-i18n-types.ts が locales/ から生成する。直接編集しない。

export type I18nTexts = {
${lines.join("\n")}
};

export type I18nAddon = ${addonType};
`;

const current = existsSync(OUT_FILE) ? readFileSync(OUT_FILE, "utf8") : undefined;

if (process.argv.includes("--check")) {
  if (current !== output) {
    console.error(`${OUT_FILE} が locales/ と合っていません。npm run i18n:types で生成し直してください。`);
    process.exit(1);
  }
} else if (current !== output) {
  writeFileSync(OUT_FILE, output);
}
