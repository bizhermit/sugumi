import { globSync } from "node:fs";
import { build } from "esbuild";
import { relative } from "node:path";

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

const CLIENT_DIRECTORY = /(^|\/)_(?:client|shared)\//;
const violations = Object.keys(result.metafile.inputs).filter((input) => !CLIENT_DIRECTORY.test(input));

if (violations.length > 0) {
  console.error(`対象外のファイルがバンドルに含まれています:\n${violations.join("\n")}`);
  process.exit(1);
}
