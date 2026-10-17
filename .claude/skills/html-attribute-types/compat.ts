/**
 * MDN の browser-compat-data から、要素の属性ごとの仕様上の状態と、主要ブラウザの安定版での対応を表にする。
 *
 *   deno run --allow-net=raw.githubusercontent.com compat.ts dialog
 *   deno run --allow-net=raw.githubusercontent.com compat.ts input/password
 *   deno run --allow-net=raw.githubusercontent.com compat.ts global
 *
 * 属性の一覧は完全ではない（input の type・value などは載っていない）。一覧は MDN のページで確かめ、
 * ここで分かるのは載っている属性の状態と対応だけ。
 */

const BASE = "https://raw.githubusercontent.com/mdn/browser-compat-data/main/html/";
const BROWSERS = ["chrome", "firefox", "safari", "safari_ios"] as const;
// "mirror" は、元のブラウザと同じ対応であることを表す
const MIRROR_OF: Record<string, string> = { safari_ios: "safari" };

type Statement = {
  version_added: string | boolean | null;
  version_removed?: string;
  flags?: unknown;
  prefix?: string;
  alternative_name?: string;
  partial_implementation?: boolean;
};
type Compat = {
  mdn_url?: string;
  status?: { experimental: boolean; standard_track: boolean; deprecated: boolean };
  support: Record<string, Statement | Statement[] | "mirror">;
};
type Node = { __compat?: Compat; [key: string]: unknown };

const target = Deno.args[0];
if (!target) {
  console.error("使い方：compat.ts <タグ名 | input/<type> | global>");
  Deno.exit(2);
}
const [tag, inputType] = target.split("/");
const [file, keys] = target === "global"
  ? ["global_attributes.json", ["html", "global_attributes"]]
  : inputType
  ? [`elements/${target}.json`, ["html", "elements", tag, `type_${inputType}`]]
  : [`elements/${tag}.json`, ["html", "elements", tag]];
const res = await fetch(BASE + file);
if (!res.ok) {
  console.error(`${BASE + file}: ${res.status}`);
  Deno.exit(1);
}
let node = await res.json() as Node;
for (const key of keys) node = node[key] as Node;

for (const [name, child] of Object.entries(node)) {
  const compat = name === "__compat" ? child as Compat : (child as Node).__compat;
  if (!compat) continue;
  const status = compat.status;
  const flags = [
    status?.deprecated && "deprecated",
    status?.experimental && "experimental",
    status && !status.standard_track && "non-standard",
  ].filter(Boolean).join(",") || "-";
  const support = BROWSERS.map((b) => `${b}:${supportOf(compat, b)}`).join(" ");
  console.log(
    `${name === "__compat" ? `(${target})` : name}\t${flags}\t${support}\t${compat.mdn_url ?? ""}`,
  );
}

/** 安定版で対応した版を返す。対応していなければ "no"、一部だけなら末尾に "(partial)" を付ける。 */
function supportOf(compat: Compat, browser: string): string {
  const entry = compat.support[browser];
  if (entry === "mirror") return supportOf(compat, MIRROR_OF[browser]);
  const statements = entry === undefined ? [] : Array.isArray(entry) ? entry : [entry];
  // 接頭辞・別名・フラグが要る対応は、そのままの名前では使えないため数えない
  const s = statements.find((s) => !s.flags && !s.prefix && !s.alternative_name);
  if (!s || s.version_removed) return "no";
  const v = s.version_added;
  if (v === true) return "yes";
  if (typeof v !== "string" || v === "preview") return "no";
  return s.partial_implementation ? `${v}(partial)` : v;
}
