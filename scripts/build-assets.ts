import { globSync } from "node:fs";
import { build } from "esbuild";
import { relative } from "node:path";

const entryPoints = globSync(["src/features/**/_assets/*.{ts,css}", "src/components/**/_assets/*.{ts,css}"]).map(
  (file) => {
    return {
      in: file,
      out: relative("src", file)
        .replace(/(^|\/)_assets\//, "$1")
        .replace(/\.(ts|css)$/, ""),
    };
  },
);

const result = await build({
  entryPoints,
  bundle: true,
  minify: true,
  format: "esm",
  platform: "browser",
  target: "es2022",
  outdir: "dist/public",
  metafile: true,
  logLevel: "info",
});

// src/libのうち許可するのは、サーバーに依存しないファイルだけ。
const CLIENT_DIRECTORY = /(^|\/)_(?:assets|shared)\//;
const CLIENT_LIB = ["src/lib/schema/", "src/lib/string.ts", "src/lib/number.ts", "src/lib/date.ts"];
const violations = Object.keys(result.metafile.inputs).filter(
  (input) => !CLIENT_DIRECTORY.test(input) && !CLIENT_LIB.some((path) => input.startsWith(path)),
);

if (violations.length > 0) {
  console.error(`対象外のファイルがバンドルに含まれています:\n${violations.join("\n")}`);
  process.exit(1);
}
