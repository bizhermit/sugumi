/**
 * tests/architecture.test.ts
 *
 * 規約の実行可能な正本（規約 §0.4 / §12.4）。node:test で自作・依存ゼロ（P10）。
 * 走査の起点は `src/` であり、`src/platform` / `src/packages/*` / `src/services/*` / `src/hosts/*` を
 * ディレクトリ列挙で発見する（§12.4 冒頭）。サービス名・package 名は一切ハードコードしない
 * （サービスを1つ追加しても本ファイルを1行も変更しなくてよい形にする）。
 *
 * フェーズ1投入項目（28項目）: 1〜20 / 34 / 35 / 36 / 39 / 40 / 41 / 50 / 52
 * 未投入: 21〜33 / 37 / 38（実プロセス起動が要るためフェーズ2の統合テスト側）
 *         42〜49 / 51（§11.8 の文書体系がフェーズ2で揃うため）
 *
 * 実行: node --conditions=development --test tests/architecture.test.ts
 *   （`development` 条件を付けないと自己参照 specifier が `dist/` に解決され、
 *    ソースの `.ts` を直さずにテストが緑になる。§12.1 / §10.5）
 */

import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

// ============================================================================
// 0. 基盤: パス解決とファイル走査
// ============================================================================

/**
 * このテストファイル自身の位置からリポジトリ直下を求める。
 * `resolveRepoRoot()`（§6.5 / §12.4-52）は「合成ルート（各 `src/hosts/<name>/main.ts`）だけが呼んでよい」ため、
 * テストからは使わず、`path` だけで独立に求める。
 */
const TEST_FILE_PATH = fileURLToPath(import.meta.url);
const REPO_ROOT = resolve(dirname(TEST_FILE_PATH), "..");
const SRC_ROOT = join(REPO_ROOT, "src");
const PUBLIC_ROOT = join(REPO_ROOT, "public");
const PUBLIC_ASSETS_ROOT = join(PUBLIC_ROOT, "assets");
const DOCS_ROOT = join(REPO_ROOT, "docs");

const PLATFORM_DIR = join(SRC_ROOT, "platform");
const PACKAGES_DIR = join(SRC_ROOT, "packages");
const SERVICES_DIR = join(SRC_ROOT, "services");
const HOSTS_DIR = join(SRC_ROOT, "hosts");

function toPosix(p: string): string {
  return p.split(sep).join("/");
}

/** ディレクトリ直下のサブディレクトリ名を列挙する（存在しなければ空配列）。 */
function listSubdirNames(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort();
}

/** ディレクトリ配下の全ファイルを再帰的に列挙する（存在しなければ空配列）。 */
function listFilesRecursive(dir: string): string[] {
  if (!existsSync(dir)) return [];
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...listFilesRecursive(full));
    } else if (entry.isFile()) {
      out.push(full);
    }
  }
  return out;
}

// --- エリア・インスタンスの動的発見（サービス名・package 名をハードコードしない） ---

const packagesDirExists = existsSync(PACKAGES_DIR);
const packageNames = listSubdirNames(PACKAGES_DIR);
const serviceNames = listSubdirNames(SERVICES_DIR);
const hostNames = listSubdirNames(HOSTS_DIR);

const platformFiles = listFilesRecursive(PLATFORM_DIR);
const packageFiles = packageNames.flatMap((n) =>
  listFilesRecursive(join(PACKAGES_DIR, n)),
);
const serviceFiles = serviceNames.flatMap((n) =>
  listFilesRecursive(join(SERVICES_DIR, n)),
);
const hostFiles = hostNames.flatMap((n) =>
  listFilesRecursive(join(HOSTS_DIR, n)),
);

const allSrcFiles = [
  ...platformFiles,
  ...packageFiles,
  ...serviceFiles,
  ...hostFiles,
];
const allTsFiles = allSrcFiles.filter((f) => f.endsWith(".ts"));

// ============================================================================
// 1. ファイル分類（エリア・インスタンス・レイヤーを path から求める）
// ============================================================================

type Area = "platform" | "packages" | "services" | "hosts";
type Layer = "shared" | "server" | "client" | null;

interface FileMeta {
  readonly absPath: string;
  /** `src/` を起点とした POSIX 形式の相対パス（例: "services/app/server/service.ts"） */
  readonly relPath: string;
  readonly area: Area;
  readonly instance: string | null;
  readonly layer: Layer;
  /** tsconfig プロジェクトを一意に識別するキー（例: "services/app/server", "hosts/app"） */
  readonly projectKey: string;
}

/** `src/` 配下の任意のパス（ファイルでもディレクトリでもよい）を分類する。存在確認はしない。 */
function classify(absPath: string): FileMeta {
  const rel = toPosix(relative(SRC_ROOT, absPath));
  const segs = rel.split("/");
  const area = segs[0] as Area;
  if (area === "platform") {
    const layer = (segs[1] ?? null) as Layer;
    return {
      absPath,
      relPath: rel,
      area,
      instance: null,
      layer,
      projectKey: `platform/${layer}`,
    };
  }
  if (area === "packages" || area === "services") {
    const instance = segs[1] ?? null;
    const layer = (segs[2] ?? null) as Layer;
    return {
      absPath,
      relPath: rel,
      area,
      instance,
      layer,
      projectKey: `${area}/${instance}/${layer}`,
    };
  }
  const instance = segs[1] ?? null;
  return {
    absPath,
    relPath: rel,
    area: "hosts",
    instance,
    layer: null,
    projectKey: `hosts/${instance}`,
  };
}

// ============================================================================
// 2. コメント除去とテンプレートリテラル抽出
// ============================================================================

/**
 * 行コメント（`//`）とブロックコメント（`/` + `*` で始まり `*` + `/` で終わる区間）を空白へ置換する。
 * 文字列・テンプレートリテラルの中身は保持する（属性値チェック等で中身を見るため）。
 *
 * これが無いと、doc コメント中の API 名の言及（例: `dom.ts` の TODO コメントにある
 * `innerHTML` / `setHTMLUnsafe` の列挙、`fragment.ts` の `target.setHTMLUnsafe(html)` という説明文）を
 * 実コードの呼び出しと誤認し、規約どおりの実装（0件）を検査が誤って赤くする（false red）。
 */
function stripComments(src: string): string {
  let out = "";
  let i = 0;
  const n = src.length;
  type State = "normal" | "line" | "block" | "sstr" | "dstr" | "tmpl";
  let state: State = "normal";
  while (i < n) {
    const c = src[i];
    const c2 = i + 1 < n ? src[i + 1] : "";
    if (state === "normal") {
      if (c === "/" && c2 === "/") {
        state = "line";
        out += "  ";
        i += 2;
        continue;
      }
      if (c === "/" && c2 === "*") {
        state = "block";
        out += "  ";
        i += 2;
        continue;
      }
      if (c === "'") {
        state = "sstr";
        out += c;
        i += 1;
        continue;
      }
      if (c === '"') {
        state = "dstr";
        out += c;
        i += 1;
        continue;
      }
      if (c === "`") {
        state = "tmpl";
        out += c;
        i += 1;
        continue;
      }
      out += c;
      i += 1;
      continue;
    }
    if (state === "line") {
      if (c === "\n") {
        state = "normal";
        out += c;
        i += 1;
        continue;
      }
      out += " ";
      i += 1;
      continue;
    }
    if (state === "block") {
      if (c === "*" && c2 === "/") {
        state = "normal";
        out += "  ";
        i += 2;
        continue;
      }
      out += c === "\n" ? "\n" : " ";
      i += 1;
      continue;
    }
    if (state === "sstr") {
      if (c === "\\") {
        out += c + c2;
        i += 2;
        continue;
      }
      if (c === "'") {
        state = "normal";
        out += c;
        i += 1;
        continue;
      }
      out += c;
      i += 1;
      continue;
    }
    if (state === "dstr") {
      if (c === "\\") {
        out += c + c2;
        i += 2;
        continue;
      }
      if (c === '"') {
        state = "normal";
        out += c;
        i += 1;
        continue;
      }
      out += c;
      i += 1;
      continue;
    }
    // state === "tmpl"
    if (c === "\\") {
      out += c + c2;
      i += 2;
      continue;
    }
    if (c === "`") {
      state = "normal";
      out += c;
      i += 1;
      continue;
    }
    out += c;
    i += 1;
  }
  return out;
}

const fileTextCache = new Map<string, string>();
function readStripped(absPath: string): string {
  const cached = fileTextCache.get(absPath);
  if (cached !== undefined) return cached;
  const stripped = stripComments(readFileSync(absPath, "utf8"));
  fileTextCache.set(absPath, stripped);
  return stripped;
}

/** コメント除去済みソースからバッククォート文字列（テンプレートリテラル）をすべて抜き出す。 */
function extractTemplateLiterals(strippedSrc: string): string[] {
  const out: string[] = [];
  const re = /`(?:\\.|[^`\\])*`/g;
  let m: RegExpExecArray | null = re.exec(strippedSrc);
  while (m !== null) {
    out.push(m[0]);
    m = re.exec(strippedSrc);
  }
  return out;
}

// ============================================================================
// 3. import specifier の抽出と解決
// ============================================================================

interface ImportOccurrence {
  readonly specifier: string;
  readonly line: number;
}

/** `from "..."` / `from '...'` / `import("...")` の形をすべて拾う（コメント除去済みソースに対して行う）。 */
function extractImportSpecifiers(strippedSrc: string): ImportOccurrence[] {
  const out: ImportOccurrence[] = [];
  const re = /\bfrom\s+["']([^"']+)["']|\bimport\s*\(\s*["']([^"']+)["']\s*\)/g;
  let m: RegExpExecArray | null = re.exec(strippedSrc);
  while (m !== null) {
    const spec = m[1] ?? m[2] ?? "";
    const line = strippedSrc.slice(0, m.index).split("\n").length;
    out.push({ specifier: spec, line });
    m = re.exec(strippedSrc);
  }
  return out;
}

const packageJsonPath = join(REPO_ROOT, "package.json");
const PACKAGE_NAME = (
  JSON.parse(readFileSync(packageJsonPath, "utf8")) as { name: string }
).name;

type ResolvedTargetKind = "self" | "relative" | "external";

interface ResolvedTarget {
  readonly kind: ResolvedTargetKind;
  readonly area: Area | null;
  readonly instance: string | null;
  readonly layer: Layer;
  /** kind === "relative" のときだけ埋まる、解決済みの絶対パス（`.ts` 付き） */
  readonly resolvedAbsPath: string | null;
}

/** specifier をエリア/インスタンス/レイヤーへ解決する。判定は文字列の先頭セグメントのみで行う（§10.5）。 */
function resolveSpecifier(spec: string, fromAbsPath: string): ResolvedTarget {
  const selfPrefix = `${PACKAGE_NAME}/`;
  if (spec.startsWith(selfPrefix)) {
    const rest = spec.slice(selfPrefix.length);
    const segs = rest.split("/");
    const head = segs[0];
    if (head === "platform") {
      return {
        kind: "self",
        area: "platform",
        instance: null,
        layer: (segs[1] ?? null) as Layer,
        resolvedAbsPath: null,
      };
    }
    if (head === "packages" || head === "services") {
      return {
        kind: "self",
        area: head,
        instance: segs[1] ?? null,
        layer: (segs[2] ?? null) as Layer,
        resolvedAbsPath: null,
      };
    }
    if (head === "hosts") {
      return {
        kind: "self",
        area: "hosts",
        instance: segs[1] ?? null,
        layer: null,
        resolvedAbsPath: null,
      };
    }
    return {
      kind: "external",
      area: null,
      instance: null,
      layer: null,
      resolvedAbsPath: null,
    };
  }
  if (spec.startsWith("./") || spec.startsWith("../")) {
    const withoutJsExt = spec.endsWith(".js") ? spec.slice(0, -3) : spec;
    const resolvedTs = `${resolve(dirname(fromAbsPath), withoutJsExt)}.ts`;
    return {
      kind: "relative",
      area: null,
      instance: null,
      layer: null,
      resolvedAbsPath: resolvedTs,
    };
  }
  return {
    kind: "external",
    area: null,
    instance: null,
    layer: null,
    resolvedAbsPath: null,
  };
}

interface ImportEdge {
  readonly file: FileMeta;
  readonly specifier: string;
  readonly line: number;
  readonly target: ResolvedTarget;
}

const allImportEdges: ImportEdge[] = allTsFiles.flatMap((absPath) => {
  const meta = classify(absPath);
  const stripped = readStripped(absPath);
  return extractImportSpecifiers(stripped).map((occ) => ({
    file: meta,
    specifier: occ.specifier,
    line: occ.line,
    target: resolveSpecifier(occ.specifier, absPath),
  }));
});

// ============================================================================
// 4. 用途説明付き許可リスト（§12.4-3 の思想を共通化）
// ============================================================================

interface AllowlistEntry {
  /** `src/` 起点の相対パス（POSIX）に対するパターン */
  readonly pattern: RegExp;
  /** 何をなぜ許可するかの1行説明。空文字列は許さない（§12.4-3 / §12.4-52）。 */
  readonly reason: string;
}

function assertAllowlistHasReasons(
  list: readonly AllowlistEntry[],
  label: string,
): void {
  const missing = list.filter((e) => e.reason.trim().length === 0);
  assert.equal(
    missing.length,
    0,
    `${label}: 説明の無い許可リストエントリがある（${missing.length}件）`,
  );
}

// ============================================================================
// 5. 依存方向の判定（§2.2 エリア間 / §2.3 レイヤー間）
// ============================================================================

/** §2.2 のエリア間行列。`to.area` が null（external）なら常に許可。 */
function isAreaDirectionAllowed(from: FileMeta, to: ResolvedTarget): boolean {
  if (to.area === null) return true;
  switch (from.area) {
    case "platform":
      return to.area === "platform";
    case "packages":
      if (to.area === "platform") return true;
      if (to.area === "packages") return to.instance === from.instance;
      return false;
    case "services":
      if (to.area === "platform" || to.area === "packages") return true;
      if (to.area === "services") return to.instance === from.instance;
      return false;
    case "hosts":
      return to.area !== "hosts";
  }
}

/**
 * §2.3 のレイヤー規則。エリアを跨ぐ組み合わせにも同じ規則を適用する（§2.3 後半の表）。
 * `hosts` はレイヤーを持たないが、`client` を参照しない「server 相当」として扱う
 * （§10.3。`lib` に `dom` が無い）。
 */
function isLayerDirectionAllowed(from: FileMeta, to: ResolvedTarget): boolean {
  if (to.area === null) return true;
  if (to.area === "hosts") return false; // hosts を誰も import しない（§2.2）
  const toLayer = to.layer;
  if (from.area === "hosts") return toLayer !== "client";
  const fromLayer = from.layer;
  if (fromLayer === "shared") return toLayer === "shared";
  if (fromLayer === "server")
    return toLayer === "shared" || toLayer === "server";
  if (fromLayer === "client")
    return toLayer === "shared" || toLayer === "client";
  return false;
}

/** `shared` レイヤー内のサブディレクトリ名（`types` / `render` / `components` / `validation` 等）を返す。 */
function sharedSubdir(meta: FileMeta): string | null {
  if (meta.layer !== "shared") return null;
  const segs = meta.relPath.split("/");
  const layerIndex = meta.area === "platform" ? 1 : 2;
  return segs[layerIndex + 1] ?? null;
}

/** §2.3「shared 内の禁止ペア」: render→components / types→他のすべて / validation→components,render。 */
function isSharedSubdirPairForbidden(
  fromSubdir: string | null,
  toSubdir: string | null,
): boolean {
  if (fromSubdir === null || toSubdir === null) return false;
  if (fromSubdir === "types") return toSubdir !== "types";
  if (fromSubdir === "render") return toSubdir === "components";
  if (fromSubdir === "validation")
    return toSubdir === "components" || toSubdir === "render";
  return false;
}

/** `server/ports/` に置かれたファイルか判定する（§2.3: ports は shared の型しか import してはならない）。 */
function isPortsFile(meta: FileMeta): boolean {
  return meta.layer === "server" && meta.relPath.includes("/server/ports/");
}

/** `server/adapters/` に置かれたファイルか判定する（§2.3: adapters を import してよいのは hosts だけ）。 */
function isAdaptersTarget(relPath: string): boolean {
  return relPath.includes("/server/adapters/");
}

/** `${PACKAGE_NAME}/...` specifier を `src/` 配下の絶対パスへ変換する（`.js` → `.ts`）。 */
function selfSpecifierToAbsPath(spec: string): string {
  const rest = spec.slice(PACKAGE_NAME.length + 1);
  const withTs = rest.endsWith(".js") ? `${rest.slice(0, -3)}.ts` : rest;
  return join(SRC_ROOT, ...withTs.split("/"));
}

function edgeTargetAbsPath(edge: ImportEdge): string | null {
  if (edge.target.kind === "self")
    return selfSpecifierToAbsPath(edge.specifier);
  if (edge.target.kind === "relative") return edge.target.resolvedAbsPath;
  return null;
}

/** ファイル単位で循環依存を検出する（DFS・3色マーキング）。見つかれば経路を返す。 */
function detectCycle(edges: readonly ImportEdge[]): string[] | null {
  const graph = new Map<string, Set<string>>();
  for (const edge of edges) {
    const to = edgeTargetAbsPath(edge);
    if (to === null) continue;
    const from = edge.file.absPath;
    if (!graph.has(from)) graph.set(from, new Set());
    graph.get(from)?.add(to);
  }
  const WHITE = 0;
  const GRAY = 1;
  const BLACK = 2;
  const color = new Map<string, number>();
  const stack: string[] = [];

  function dfs(node: string): string[] | null {
    color.set(node, GRAY);
    stack.push(node);
    for (const next of graph.get(node) ?? []) {
      const c = color.get(next) ?? WHITE;
      if (c === GRAY) {
        const idx = stack.indexOf(next);
        return [...stack.slice(idx), next].map((p) =>
          toPosix(relative(SRC_ROOT, p)),
        );
      }
      if (c === WHITE) {
        const found = dfs(next);
        if (found) return found;
      }
    }
    color.set(node, BLACK);
    stack.pop();
    return null;
  }

  for (const node of graph.keys()) {
    if ((color.get(node) ?? WHITE) === WHITE) {
      const found = dfs(node);
      if (found) return found;
    }
  }
  return null;
}

// ============================================================================
// 6. JSONC（`//` 行コメント付き JSON）読み取り。tsconfig.json 用。
// ============================================================================

function readJsonc(path: string): unknown {
  const raw = readFileSync(path, "utf8");
  const noComments = raw.replace(/^[ \t]*\/\/.*$/gm, "");
  return JSON.parse(noComments);
}

interface TsconfigShape {
  readonly references?: ReadonlyArray<{ readonly path: string }>;
}

// ============================================================================
// 7. service.ts の構造読み取り（ServiceDef / assetNamespaces / routes）
// ============================================================================

function serviceTsPath(svc: string): string {
  return join(SERVICES_DIR, svc, "server", "service.ts");
}

function extractAssetNamespaces(svcTsPath: string): string[] {
  const stripped = readStripped(svcTsPath);
  const m = /assetNamespaces\s*:\s*\[([^\]]*)\]/.exec(stripped);
  const inner = m?.[1];
  if (inner === undefined) return [];
  const items = inner.match(/"([^"]*)"/g) ?? [];
  return items.map((s) => s.slice(1, -1));
}

/** `routes: [ ... ]` の角括弧内テキストを、ネストを数えて丸ごと抜き出す。 */
function extractRoutesArrayText(stripped: string): string | null {
  const idx = stripped.search(/\broutes\s*:\s*\[/);
  if (idx === -1) return null;
  const start = stripped.indexOf("[", idx);
  let depth = 0;
  for (let i = start; i < stripped.length; i += 1) {
    if (stripped[i] === "[") depth += 1;
    else if (stripped[i] === "]") {
      depth -= 1;
      if (depth === 0) return stripped.slice(start, i + 1);
    }
  }
  return null;
}

/** 配列テキストの直下（トップレベル）にある `{ ... }` オブジェクトリテラルをすべて抜き出す。 */
function extractTopLevelObjects(arrayText: string): string[] {
  const inner = arrayText.slice(1, -1);
  const objects: string[] = [];
  let depth = 0;
  let start = -1;
  for (let i = 0; i < inner.length; i += 1) {
    const c = inner[i];
    if (c === "{") {
      if (depth === 0) start = i;
      depth += 1;
    } else if (c === "}") {
      depth -= 1;
      if (depth === 0 && start !== -1) {
        objects.push(inner.slice(start, i + 1));
        start = -1;
      }
    }
  }
  return objects;
}

function routeObjectsOf(svc: string): string[] {
  const p = serviceTsPath(svc);
  if (!existsSync(p)) return [];
  const stripped = readStripped(p);
  const arr = extractRoutesArrayText(stripped);
  if (arr === null) return [];
  return extractTopLevelObjects(arr);
}

// ============================================================================
// テスト本体
// ============================================================================

describe("0件アサート（裁定39・§12.4 冒頭）", () => {
  test("src/platform は1件以上の .ts を持つ（必須）", () => {
    assert.ok(
      platformFiles.filter((f) => f.endsWith(".ts")).length >= 1,
      `src/platform の .ts が0件。走査起点(${SRC_ROOT})を確認`,
    );
  });

  test("src/services/* は1件以上の .ts を持つ（必須）", () => {
    assert.ok(
      serviceFiles.filter((f) => f.endsWith(".ts")).length >= 1,
      `src/services/* の .ts が0件。走査起点(${SRC_ROOT})を確認`,
    );
  });

  test("src/hosts/* は1件以上の .ts を持つ（必須）", () => {
    assert.ok(
      hostFiles.filter((f) => f.endsWith(".ts")).length >= 1,
      `src/hosts/* の .ts が0件。走査起点(${SRC_ROOT})を確認`,
    );
  });

  test("src/packages/* はディレクトリが存在すれば1件以上の .ts を持つ", () => {
    if (!packagesDirExists) {
      // packages/ を持たない fork では 0 件を許す（§12.4 冒頭）
      assert.ok(true);
      return;
    }
    assert.ok(
      packageFiles.filter((f) => f.endsWith(".ts")).length >= 1,
      "src/packages/ は存在するが .ts が0件",
    );
  });

  test("走査ファイル総数（.ts）が0でない", () => {
    assert.ok(
      allTsFiles.length > 0,
      `走査した .ts の総数が0。走査起点(${SRC_ROOT})を確認`,
    );
  });
});

describe("§12.4-1 エリア間・レイヤー間の依存方向", () => {
  const selfEdges = allImportEdges.filter((e) => e.target.kind === "self");

  test("エリア間の依存方向が §2.2 に従っている", () => {
    const violations = selfEdges
      .filter((e) => !isAreaDirectionAllowed(e.file, e.target))
      .map((e) => `${e.file.relPath}:${e.line} -> ${e.specifier}`);
    assert.deepEqual(
      violations,
      [],
      `エリア間の禁止された依存:\n${violations.join("\n")}`,
    );
  });

  test("レイヤー間の依存方向が §2.3 に従っている（エリアを跨ぐ組み合わせも含む）", () => {
    const violations = selfEdges
      .filter((e) => !isLayerDirectionAllowed(e.file, e.target))
      .map((e) => `${e.file.relPath}:${e.line} -> ${e.specifier}`);
    assert.deepEqual(
      violations,
      [],
      `レイヤー間の禁止された依存:\n${violations.join("\n")}`,
    );
  });

  test("hosts/* を import しているファイルが無い（本番コードから hosts への import は禁止）", () => {
    const violations = selfEdges
      .filter((e) => e.target.area === "hosts")
      .map((e) => `${e.file.relPath}:${e.line} -> ${e.specifier}`);
    assert.deepEqual(violations, []);
  });

  test("shared 内の禁止ペア（render→components / types→他 / validation→components,render）が無い", () => {
    const violations: string[] = [];
    for (const e of selfEdges) {
      if (e.file.layer !== "shared" || e.target.layer !== "shared") continue;
      const fromSub = sharedSubdir(e.file);
      // target のサブディレクトリは specifier からは分からないため実ファイルパスで求める
      const targetAbs = selfSpecifierToAbsPath(e.specifier);
      const toSub = sharedSubdir(classify(targetAbs));
      if (isSharedSubdirPairForbidden(fromSub, toSub)) {
        violations.push(
          `${e.file.relPath}:${e.line} -> ${e.specifier} (${fromSub} -> ${toSub})`,
        );
      }
    }
    assert.deepEqual(violations, []);
  });

  test("server/ports/ は shared の型しか import していない", () => {
    const violations = selfEdges
      .filter((e) => isPortsFile(e.file))
      .filter((e) => e.target.layer !== "shared")
      .map((e) => `${e.file.relPath}:${e.line} -> ${e.specifier}`);
    assert.deepEqual(violations, []);
  });

  test("adapters/ を import してよいのは hosts/ だけである", () => {
    const violations = selfEdges
      .filter((e) => {
        const targetAbs = selfSpecifierToAbsPath(e.specifier);
        return isAdaptersTarget(toPosix(relative(SRC_ROOT, targetAbs)));
      })
      .filter((e) => e.file.area !== "hosts")
      .map((e) => `${e.file.relPath}:${e.line} -> ${e.specifier}`);
    assert.deepEqual(violations, []);
  });

  test("循環依存が無い（ファイル単位）", () => {
    const cycle = detectCycle(allImportEdges);
    assert.equal(cycle, null, `循環依存: ${cycle?.join(" -> ")}`);
  });
});

describe("§12.4-2 process.env の出現箇所", () => {
  test("process.env が platform/server/config/ 以外に出現しない", () => {
    const allowedDir = "platform/server/config/";
    const violations = allTsFiles
      .map((f) => classify(f))
      .filter((meta) => !meta.relPath.startsWith(allowedDir))
      .filter((meta) => /\bprocess\.env\b/.test(readStripped(meta.absPath)))
      .map((meta) => meta.relPath);
    assert.deepEqual(violations, []);
  });
});

describe("§12.4-3 unsafeRaw / applyVerifiedFragment / *Unscoped の許可リスト", () => {
  /**
   * 用途説明付き許可リスト（§12.4-3・§6.1）。説明の無いエントリは検査を失敗させる。
   * フェーズ1時点で該当する呼び出しは0件のため空で開始する
   * （呼び出しが増えたら {pattern, reason} を1件ずつ足す。既存の検査コードは変更しない）。
   */
  const ALLOWLIST: readonly AllowlistEntry[] = [];

  const DEFINITION_FILES = new Set([
    "platform/shared/render/html.ts",
    "platform/client/dom.ts",
  ]);
  function isPortDefinitionFile(relPath: string): boolean {
    return /\/server\/ports\/[^/]+\.ts$/.test(relPath);
  }

  test("許可リストの全エントリに用途説明がある", () => {
    assertAllowlistHasReasons(ALLOWLIST, "§12.4-3");
  });

  test("unsafeRaw( / applyVerifiedFragment( / *Unscoped( の呼び出しがすべて許可リストに載っている", () => {
    const pattern = /\b(unsafeRaw|applyVerifiedFragment|\w*Unscoped)\s*\(/;
    const found: string[] = [];
    for (const f of allTsFiles) {
      const meta = classify(f);
      if (
        DEFINITION_FILES.has(meta.relPath) ||
        isPortDefinitionFile(meta.relPath)
      )
        continue;
      if (pattern.test(readStripped(f))) found.push(meta.relPath);
    }
    const notAllowed = found.filter(
      (relPath) => !ALLOWLIST.some((e) => e.pattern.test(relPath)),
    );
    assert.deepEqual(notAllowed, []);
  });
});

describe("§12.4-4 index.ts バレル禁止", () => {
  test("src/ 配下に index.ts が存在しない", () => {
    const violations = allTsFiles
      .filter((f) => f.endsWith(`${sep}index.ts`))
      .map((f) => classify(f).relPath);
    assert.deepEqual(violations, []);
  });
});

describe("§12.4-5 export default 禁止", () => {
  test("export default が存在しない", () => {
    const violations = allTsFiles
      .filter((f) => /\bexport\s+default\b/.test(readStripped(f)))
      .map((f) => classify(f).relPath);
    assert.deepEqual(violations, []);
  });
});

describe("§12.4-6 相対 import の拡張子", () => {
  test("相対 import はすべて .js 拡張子を持つ", () => {
    const violations = allImportEdges
      .filter(
        (e) => e.specifier.startsWith("./") || e.specifier.startsWith("../"),
      )
      .filter((e) => !e.specifier.endsWith(".js"))
      .map((e) => `${e.file.relPath}:${e.line} -> ${e.specifier}`);
    assert.deepEqual(violations, []);
  });
});

describe("§12.4-7 プロジェクトをまたぐ相対 import の禁止", () => {
  test("相対 import の解決先が同一プロジェクト内である", () => {
    const violations: string[] = [];
    for (const e of allImportEdges) {
      if (e.target.kind !== "relative" || e.target.resolvedAbsPath === null)
        continue;
      const targetMeta = classify(e.target.resolvedAbsPath);
      if (targetMeta.projectKey !== e.file.projectKey) {
        violations.push(
          `${e.file.relPath}:${e.line} -> ${e.specifier} (target project: ${targetMeta.projectKey})`,
        );
      }
    }
    assert.deepEqual(violations, []);
  });
});

const inlineHandlerTargetDirs = [
  "platform/server/render/",
  ...serviceNames.map((n) => `services/${n}/shared/components/`),
];

describe("§12.4-8 インラインイベントハンドラ属性の禁止", () => {
  test("on\\w+= を含む HTML 文字列が対象ディレクトリに出現しない", () => {
    const violations: string[] = [];
    for (const f of allTsFiles) {
      const meta = classify(f);
      if (!inlineHandlerTargetDirs.some((d) => meta.relPath.startsWith(d)))
        continue;
      for (const tmpl of extractTemplateLiterals(readStripped(f))) {
        if (/\bon[a-zA-Z]+\s*=/.test(tmpl)) violations.push(meta.relPath);
      }
    }
    assert.deepEqual(violations, []);
  });
});

const URL_ATTRS = [
  "href",
  "src",
  "action",
  "formaction",
  "poster",
  "data",
  "ping",
  "cite",
  "srcset",
  "background",
];

/**
 * `${…}` を不透明な塊として扱いながら、閉じ文字 `closer` までの値を読み取る。
 * 単純な `[^"]*` で切ると `${attrUrl("/a")}/x/${y}` のように補間の内側に `"` があるとき
 * 値が途中で切れ、**2つ目以降の補間が検査から漏れる**（アンカリング欠陥と同型の取りこぼし）。
 * 戻り値は読み取った値（補間を含む）。閉じ文字が見つからなければ末尾までを返す。
 */
function readValueSkippingInterpolations(
  s: string,
  start: number,
  closer: string,
): string {
  let i = start;
  let out = "";
  while (i < s.length) {
    if (s[i] === closer) return out;
    if (s[i] === "$" && s[i + 1] === "{") {
      const j = skipInterpolation(s, i + 2);
      out += s.slice(i, j);
      i = j;
      continue;
    }
    out += s[i];
    i++;
  }
  return out;
}

/**
 * `${` の直後（`start`）から、対応する `}` の次の位置までを飛ばす。
 * **式中の文字列リテラルは中身を数えない**（`x === "{" ? a : b` のように裸の `{` `}` が
 * 文字列として現れると、単純な文字数カウントでは深さが崩れて閉じ位置を誤判定するため。qa N4）。
 */
function skipInterpolation(s: string, start: number): number {
  let depth = 1;
  let i = start;
  while (i < s.length && depth > 0) {
    const c = s[i];
    if (c === '"' || c === "'" || c === "`") {
      i++;
      while (i < s.length && s[i] !== c) {
        if (s[i] === "\\") i++;
        i++;
      }
      i++;
      continue;
    }
    if (c === "{") depth++;
    else if (c === "}") depth--;
    i++;
  }
  return i;
}

/**
 * 値の**トップレベル**に現れる `${` の直後位置を列挙する
 * （補間の内側にネストした `${` は対象にしない。誤検出を避けるため）。
 */
function interpolationOffsets(value: string): number[] {
  const offsets: number[] = [];
  let i = 0;
  while (i < value.length) {
    if (value[i] === "$" && value[i + 1] === "{") {
      offsets.push(i + 2);
      i = skipInterpolation(value, i + 2);
      continue;
    }
    i++;
  }
  return offsets;
}

/** `${` の直後が attrUrl( / attrSrcset( で始まっているか */
function isVerifiedUrlInterpolation(afterInterp: string): boolean {
  return /^\s*(attrUrl|attrSrcset)\s*\(/.test(afterInterp);
}

/**
 * §12.4-9 の走査本体。1つのテンプレートリテラルから違反の理由を列挙する。
 *
 * **実ファイル走査と自己回帰テストの両方がこの1関数を呼ぶ**（実装を複製しない）。
 * 複製すると、実装が劣化しても自己回帰テストは複製側を見て緑のままになり、
 * 「検査の検査」が沈黙する（sec-audit L-2 が問題にしたのはまさにこの沈黙である）。
 *
 * 「`${` が続くことを違反とする」書き方はしない（規約どおりの href="${attrUrl(u)}" を
 * 誤って違反判定してしまうため。§12.4-9 の註）。正しいのは「`${` の直後が attrUrl(/attrSrcset( で
 * 始まっていない」ことを違反とする書き方である。
 */
function scanUrlAttrInterpolations(tmpl: string): string[] {
  const found: string[] = [];
  for (const attr of URL_ATTRS) {
    // 属性値の「先頭」ではなく「内部全体」を走査する。
    // `attr="\$\{` の形にアンカリングすると href="/next/${x}" のように
    // 静的接頭辞があるものに一度も一致せず、恒久的な検出漏れになる（§12.4-9）。
    const re = new RegExp(`\\b${attr}\\s*=\\s*"`, "g");
    let m: RegExpExecArray | null = re.exec(tmpl);
    while (m !== null) {
      const value = readValueSkippingInterpolations(
        tmpl,
        m.index + m[0].length,
        '"',
      );
      // 1つの属性値に補間が複数回あってもすべて検査する
      for (const at of interpolationOffsets(value)) {
        if (!isVerifiedUrlInterpolation(value.slice(at))) {
          found.push(
            `${attr} 属性の補間が attrUrl/attrSrcset を経由していない`,
          );
        }
      }
      m = re.exec(tmpl);
    }
  }
  // CSS url() も同型。`url(\s*\$\{` にアンカリングせず括弧内を走査する
  const urlRe = /\burl\(/g;
  let um: RegExpExecArray | null = urlRe.exec(tmpl);
  while (um !== null) {
    const inner = readValueSkippingInterpolations(
      tmpl,
      um.index + um[0].length,
      ")",
    );
    for (const at of interpolationOffsets(inner)) {
      if (!isVerifiedUrlInterpolation(inner.slice(at))) {
        found.push("CSS url() の補間が attrUrl を経由していない");
      }
    }
    um = urlRe.exec(tmpl);
  }
  return found;
}

describe("§12.4-9 URL 属性の ${} 直挿し禁止", () => {
  test("URL 属性・CSS url() の補間が attrUrl(/attrSrcset( を経由している", () => {
    const violations: string[] = [];
    for (const f of allTsFiles) {
      const meta = classify(f);
      for (const tmpl of extractTemplateLiterals(readStripped(f))) {
        for (const reason of scanUrlAttrInterpolations(tmpl)) {
          violations.push(`${meta.relPath}: ${reason}`);
        }
      }
    }
    assert.deepEqual(violations, []);
  });
});

describe("§12.4-10 属性値は二重引用符で囲む", () => {
  test("HTML テンプレート中に無引用符・単一引用符の属性補間が無い", () => {
    const violations: string[] = [];
    for (const f of allTsFiles) {
      const meta = classify(f);
      for (const tmpl of extractTemplateLiterals(readStripped(f))) {
        // 二重引用符で囲まれた属性値を先に取り除いてから検査する。
        // 取り除かないと href="/next?url=${x}" の `url=${` を「無引用符の属性値」と
        // 誤認し、本来 §12.4-9 が扱う領域を本項が偶然拾ってしまう
        // （メッセージが実態と食い違い、保守者を誤った修正へ誘導する）。
        const withoutDoubleQuoted = tmpl.replace(/"[^"]*"/g, '""');
        if (/=\s*\$\{/.test(withoutDoubleQuoted))
          violations.push(`${meta.relPath}: 無引用符の属性値`);
        if (/='[^']*\$\{/.test(withoutDoubleQuoted))
          violations.push(`${meta.relPath}: 単一引用符の属性値`);
      }
    }
    assert.deepEqual(violations, []);
  });
});

describe("§12.4-11 セキュリティ境界のブランド型への型アサーション禁止", () => {
  test("as Html / as SafeRedirect / as Secret（unknown 経由を含む）が存在しない", () => {
    // `FragmentSource` の `kind: "html"`（§4.5）は文字列リテラルであり `Html` 識別子と衝突しない
    const pattern = /\bas\s+(?:unknown\s+as\s+)?(Html|SafeRedirect|Secret)\b/;
    const violations = allTsFiles
      .filter((f) => pattern.test(readStripped(f)))
      .map((f) => classify(f).relPath);
    assert.deepEqual(violations, []);
  });
});

const HTML_SINK_PATTERNS = [
  /\.innerHTML\b/,
  /\.outerHTML\b/,
  /\bsetHTMLUnsafe\s*\(/,
  /\bparseHTMLUnsafe\s*\(/,
  /\bstreamHTMLUnsafe\s*\(/,
  /\binsertAdjacentHTML\s*\(/,
];
const HTML_SINK_ALLOWED_FILE = "platform/client/dom.ts";

describe("§12.4-12 HTML シンクは platform/client/dom.ts に限る", () => {
  test("innerHTML 等の HTML シンクが dom.ts 以外に出現しない", () => {
    const violations: string[] = [];
    for (const f of allTsFiles) {
      const meta = classify(f);
      if (meta.relPath === HTML_SINK_ALLOWED_FILE) continue;
      const stripped = readStripped(f);
      if (HTML_SINK_PATTERNS.some((p) => p.test(stripped)))
        violations.push(meta.relPath);
    }
    assert.deepEqual(violations, []);
  });
});

describe("§12.4-13 RouteDef の access 宣言とサービス単位 public スナップショット", () => {
  /**
   * フェーズ1時点では全サービスが `routes: []`（実装はフェーズ2〜4）であるため、
   * スナップショットは「全サービス共通で 0」という単一の期待値で表現できる。
   * サービスごとに値が分岐したら（route が追加されたら）、その時点で本定数を
   * サービス名をキーにしない形（例: service.ts 側にコメントで期待値を明記し読み取る等）へ
   * 差し替える必要がある — これは「意図した変更を強制する」という本項の趣旨どおりの振る舞いである。
   */
  const PHASE1_EXPECTED_PUBLIC_COUNT = 0;

  for (const svc of serviceNames) {
    test(`${svc}: 全 RouteDef が access を宣言している（pattern と access の出現数が一致）`, () => {
      const objects = routeObjectsOf(svc);
      for (const obj of objects) {
        assert.match(
          obj,
          /\baccess\s*:\s*"(public|authenticated)"/,
          `${svc}: access を宣言していない RouteDef がある`,
        );
      }
    });

    test(`${svc}: public ルート数がスナップショットと一致する`, () => {
      const objects = routeObjectsOf(svc);
      const publicCount = objects.filter((o) =>
        /\baccess\s*:\s*"public"/.test(o),
      ).length;
      assert.equal(
        publicCount,
        PHASE1_EXPECTED_PUBLIC_COUNT,
        `${svc}: public ルート数(${publicCount})がスナップショット(${PHASE1_EXPECTED_PUBLIC_COUNT})と不一致`,
      );
    });
  }
});

describe("§12.4-14 Location ヘッダの直書き禁止", () => {
  test("HandlerResult.headers に Location を直接書いている箇所が無い", () => {
    const serverFiles = allTsFiles.filter(
      (f) => classify(f).layer === "server",
    );
    const violations = serverFiles
      .filter((f) =>
        /\bheaders\s*:\s*\{[^}]*\bLocation\s*:/s.test(readStripped(f)),
      )
      .map((f) => classify(f).relPath);
    assert.deepEqual(violations, []);
  });
});

describe("§12.4-15 scryptSync / Math.random の禁止（server 全域）", () => {
  test("scryptSync( / Math.random( が src/**/server/** に出現しない", () => {
    const serverFiles = allTsFiles.filter(
      (f) => classify(f).layer === "server",
    );
    const violations = serverFiles
      .filter((f) => {
        const s = readStripped(f);
        return /\bscryptSync\s*\(/.test(s) || /\bMath\.random\s*\(/.test(s);
      })
      .map((f) => classify(f).relPath);
    assert.deepEqual(violations, []);
  });
});

describe("§12.4-16 console. は platform/server/log/ に限る（全エリア）", () => {
  test("console. が platform/server/log/ 以外に出現しない", () => {
    const allowedDir = "platform/server/log/";
    const violations = allTsFiles
      .map((f) => classify(f))
      .filter((meta) => !meta.relPath.startsWith(allowedDir))
      .filter((meta) => /\bconsole\s*\./.test(readStripped(meta.absPath)))
      .map((meta) => meta.relPath);
    assert.deepEqual(violations, []);
  });
});

describe("§12.4-17 server からテストダブルを参照しない", () => {
  test("src/**/server/** から createTestDeps が参照されていない（*.test.ts を除く）", () => {
    const serverFiles = allTsFiles.filter(
      (f) => classify(f).layer === "server" && !f.endsWith(".test.ts"),
    );
    const violations = serverFiles
      .filter((f) => /\bcreateTestDeps\b/.test(readStripped(f)))
      .map((f) => classify(f).relPath);
    assert.deepEqual(violations, []);
  });
});

describe("§12.4-18 adapters 内 SQL のテンプレートリテラル補間禁止", () => {
  test("src/**/server/adapters/** のテンプレートリテラルに ${} 補間が無い", () => {
    const adapterFiles = allTsFiles.filter((f) =>
      classify(f).relPath.includes("/server/adapters/"),
    );
    const violations: string[] = [];
    for (const f of adapterFiles) {
      for (const tmpl of extractTemplateLiterals(readStripped(f))) {
        if (/\$\{/.test(tmpl)) violations.push(classify(f).relPath);
      }
    }
    assert.deepEqual(violations, []);
  });
});

describe("§12.4-19 js クッキー名リテラルの許可リスト", () => {
  /** js クッキーの名前=値リテラル（`js=1` / `js=dpu`。§4.7）。実装は未着手のため空で開始する。 */
  const ALLOWLIST: readonly AllowlistEntry[] = [];

  test("許可リストの全エントリに用途説明がある", () => {
    assertAllowlistHasReasons(ALLOWLIST, "§12.4-19");
  });

  test("js クッキー名リテラルが許可リスト外の server/ ファイルに出現しない", () => {
    const pattern = /\bjs=(1|dpu)\b/;
    const serverFiles = allTsFiles.filter(
      (f) => classify(f).layer === "server",
    );
    const found = serverFiles
      .filter((f) => pattern.test(readStripped(f)))
      .map((f) => classify(f).relPath);
    const notAllowed = found.filter(
      (relPath) => !ALLOWLIST.some((e) => e.pattern.test(relPath)),
    );
    assert.deepEqual(notAllowed, []);
  });
});

describe("§12.4-20 GET ハンドラは書き込み系 port を呼ばない", () => {
  test('method: "GET" の RouteDef オブジェクト内に書き込み系メソッド呼び出しが無い', () => {
    // 検査範囲は RouteDef オブジェクトリテラルのテキストに限る（規約の限界どおり。32 と対にする）
    const WRITE_PREFIX =
      /\b(create\w*|update\w*|delete\w*|insert\w*|consume\w*)\s*\(/;
    const violations: string[] = [];
    for (const svc of serviceNames) {
      const objects = routeObjectsOf(svc).filter((o) =>
        /\bmethod\s*:\s*"GET"\b/.test(o),
      );
      for (const obj of objects) {
        if (WRITE_PREFIX.test(obj))
          violations.push(`${svc}: GET ルートに書き込み系呼び出しを検出`);
      }
    }
    assert.deepEqual(violations, []);
  });
});

// ============================================================================
// §12.4-34: ルート tsconfig.json の references
// ============================================================================

/** `src/` 配下を tsconfig.json の所在で走査し、実在するプロジェクトの相対パス一覧（POSIX）を返す。 */
function discoverProjects(): string[] {
  const found = listFilesRecursive(SRC_ROOT).filter((f) =>
    f.endsWith("tsconfig.json"),
  );
  return found.map((f) => toPosix(relative(SRC_ROOT, dirname(f)))).sort();
}

const actualProjects = discoverProjects();
const rootTsconfigPath = join(REPO_ROOT, "tsconfig.json");

describe("§12.4-34 ルート tsconfig.json の references", () => {
  test("実在する全プロジェクトと過不足なく一致する", () => {
    const rootTsconfig = readJsonc(rootTsconfigPath) as TsconfigShape;
    const expected = actualProjects.map((p) => `src/${p}`).sort();
    const actual = (rootTsconfig.references ?? []).map((r) => r.path).sort();
    assert.deepEqual(actual, expected);
  });

  test("(a) 各プロジェクトの references の向きが §2.2 / §2.3 に反していない", () => {
    const violations: string[] = [];
    for (const projRel of actualProjects) {
      const projDir = join(SRC_ROOT, ...projRel.split("/"));
      const cfg = readJsonc(join(projDir, "tsconfig.json")) as TsconfigShape;
      const fromMeta = classify(projDir);
      for (const ref of cfg.references ?? []) {
        const targetDir = resolve(projDir, ref.path);
        const toMeta = classify(targetDir);
        const target: ResolvedTarget = {
          kind: "self",
          area: toMeta.area,
          instance: toMeta.instance,
          layer: toMeta.layer,
          resolvedAbsPath: null,
        };
        if (
          !isAreaDirectionAllowed(fromMeta, target) ||
          !isLayerDirectionAllowed(fromMeta, target)
        ) {
          violations.push(`${projRel} -> ${ref.path}`);
        }
      }
    }
    assert.deepEqual(violations, []);
  });

  test("(b) 全 services/<name> に対応する hosts/ が少なくとも1つ存在する", () => {
    for (const svc of serviceNames) {
      const covered = hostNames.some((h) => {
        const hostDir = join(HOSTS_DIR, h);
        const tsconfigPath = join(hostDir, "tsconfig.json");
        if (!existsSync(tsconfigPath)) return false;
        const cfg = readJsonc(tsconfigPath) as TsconfigShape;
        return (cfg.references ?? []).some(
          (r) => resolve(hostDir, r.path) === join(SERVICES_DIR, svc, "server"),
        );
      });
      assert.ok(covered, `services/${svc} をマウントする hosts/ が無い`);
    }
  });

  test("(c) 各 services/<name> の references に assetNamespaces 未宣言の packages が含まれない", () => {
    for (const svc of serviceNames) {
      const declared = new Set(
        extractAssetNamespaces(serviceTsPath(svc))
          .filter((n) => n.startsWith("packages/"))
          .map((n) => n.slice("packages/".length)),
      );
      for (const layer of ["shared", "server", "client"] as const) {
        const projDir = join(SERVICES_DIR, svc, layer);
        const tsconfigPath = join(projDir, "tsconfig.json");
        if (!existsSync(tsconfigPath)) continue;
        const cfg = readJsonc(tsconfigPath) as TsconfigShape;
        for (const ref of cfg.references ?? []) {
          const targetDir = resolve(projDir, ref.path);
          const rel = toPosix(relative(SRC_ROOT, targetDir));
          const m = /^packages\/([^/]+)\//.exec(rel);
          const pkgName = m?.[1];
          if (pkgName !== undefined) {
            assert.ok(
              declared.has(pkgName),
              `services/${svc}/${layer}: references に packages/${pkgName} があるが assetNamespaces 未宣言`,
            );
          }
        }
      }
    }
  });
});

// ============================================================================
// §12.4-35: service.ts の ServiceDef export と assetNamespaces の双方向一致
// ============================================================================

describe("§12.4-35 service.ts の ServiceDef export と assetNamespaces", () => {
  for (const svc of serviceNames) {
    test(`${svc}: service.ts が ServiceDef を1つだけ export している`, () => {
      const p = serviceTsPath(svc);
      const stripped = readStripped(p);
      const matches =
        stripped.match(/\bexport\s+const\s+\w+\s*:\s*ServiceDef\b/g) ?? [];
      assert.equal(
        matches.length,
        1,
        `${svc}: ServiceDef の export 数が1でない（${matches.length}件）`,
      );
    });

    test(`${svc}: assetNamespaces の packages 宣言が実際の import と双方向一致する`, () => {
      const declared = new Set(
        extractAssetNamespaces(serviceTsPath(svc))
          .filter((n) => n.startsWith("packages/"))
          .map((n) => n.slice("packages/".length)),
      );
      const actuallyImported = new Set<string>();
      const svcFiles = listFilesRecursive(join(SERVICES_DIR, svc)).filter((f) =>
        f.endsWith(".ts"),
      );
      for (const f of svcFiles) {
        for (const occ of extractImportSpecifiers(readStripped(f))) {
          const target = resolveSpecifier(occ.specifier, f);
          if (
            target.kind === "self" &&
            target.area === "packages" &&
            target.instance !== null
          ) {
            actuallyImported.add(target.instance);
          }
        }
      }
      // (a) 宣言していない packages を import していない
      const undeclared = [...actuallyImported].filter((n) => !declared.has(n));
      assert.deepEqual(
        undeclared,
        [],
        `${svc}: 未宣言の packages を import: ${undeclared.join(",")}`,
      );
      // (b) 宣言しているが実際には import していない名前空間が無い（過剰宣言の検出）
      const overDeclared = [...declared].filter(
        (n) => !actuallyImported.has(n),
      );
      assert.deepEqual(
        overDeclared,
        [],
        `${svc}: 過剰宣言（未使用の packages 宣言）: ${overDeclared.join(",")}`,
      );
    });
  }
});

// ============================================================================
// §12.4-36: client から i18n/ja.ts を import しない
// ============================================================================

describe("§12.4-36 client から i18n リソースを import しない", () => {
  test("src/**/client/** から platform/shared/i18n/ja.js（および将来のロケール別リソース）への import が無い", () => {
    const clientFiles = allTsFiles.filter(
      (f) => classify(f).layer === "client",
    );
    const violations: string[] = [];
    for (const f of clientFiles) {
      for (const occ of extractImportSpecifiers(readStripped(f))) {
        if (/\/i18n\/[^/]+\.js$/.test(occ.specifier)) {
          violations.push(
            `${classify(f).relPath}:${occ.line} -> ${occ.specifier}`,
          );
        }
      }
    }
    assert.deepEqual(violations, []);
  });
});

// ============================================================================
// §12.4-39: コンポーネント CSS と CE の対応（双方向）
// ============================================================================

const allPublicFiles = listFilesRecursive(PUBLIC_ROOT);
const allPublicCssFiles = allPublicFiles.filter((f) => f.endsWith(".css"));

interface PublicAssetClassification {
  readonly areaNamespace: string;
  readonly kind: "components" | "styles" | "other";
}

/** `public/assets/` からの相対パス（POSIX）を分類する。AssetNamespace 形式（platform / packages/<n> / services/<n>）を読む。 */
function classifyPublicAsset(relFromAssets: string): PublicAssetClassification {
  const segs = relFromAssets.split("/");
  let idx = 0;
  const area = segs[idx];
  idx += 1;
  const namespaceSegs = [area];
  if (area === "packages" || area === "services") {
    namespaceSegs.push(segs[idx] ?? "");
    idx += 1;
  }
  const layerSeg = segs[idx];
  idx += 1;
  const kindSeg = segs[idx];
  const areaNamespace = namespaceSegs.join("/");
  if (layerSeg !== "client") return { areaNamespace, kind: "other" };
  if (kindSeg === "components") return { areaNamespace, kind: "components" };
  if (kindSeg === "styles") return { areaNamespace, kind: "styles" };
  return { areaNamespace, kind: "other" };
}

interface ClassAComponent {
  readonly areaNamespace: string;
  readonly relFromComponentsDir: string; // components/ 配下の相対パス（拡張子無し）
}

/**
 * 分類 A の CE（規約 §5.2 / §12.4-39）を発見する。判定基準は「同エリアの
 * `<namespace>/shared/components/<name>.ts` が `mode: "shadow"` を実装していること」（§12.4-39 の註）。
 * フェーズ1は components/ ディレクトリ自体が存在しないため、常に空配列を返す。
 */
function discoverClassAComponents(): ClassAComponent[] {
  const namespaceRoots: ReadonlyArray<{
    readonly areaNamespace: string;
    readonly dir: string;
  }> = [
    { areaNamespace: "platform", dir: PLATFORM_DIR },
    ...packageNames.map((n) => ({
      areaNamespace: `packages/${n}`,
      dir: join(PACKAGES_DIR, n),
    })),
    ...serviceNames.map((n) => ({
      areaNamespace: `services/${n}`,
      dir: join(SERVICES_DIR, n),
    })),
  ];
  const results: ClassAComponent[] = [];
  for (const { areaNamespace, dir } of namespaceRoots) {
    const componentsDir = join(dir, "client", "components");
    const ceFiles = listFilesRecursive(componentsDir).filter((f) =>
      f.endsWith(".ts"),
    );
    for (const f of ceFiles) {
      const relFromComponentsDir = toPosix(relative(componentsDir, f)).replace(
        /\.ts$/,
        "",
      );
      const name = relFromComponentsDir.split("/").pop() ?? "";
      const sharedComponentPath = join(
        dir,
        "shared",
        "components",
        `${name}.ts`,
      );
      if (
        existsSync(sharedComponentPath) &&
        /mode\s*:\s*"shadow"/.test(readStripped(sharedComponentPath))
      ) {
        results.push({ areaNamespace, relFromComponentsDir });
      }
    }
  }
  return results;
}

describe("§12.4-39 コンポーネント CSS と CE の対応", () => {
  test("public/assets/**/*.css はすべて components/ か styles/ の配下にある", () => {
    const violations = allPublicCssFiles
      .map((f) => toPosix(relative(PUBLIC_ASSETS_ROOT, f)))
      .filter((rel) => classifyPublicAsset(rel).kind === "other");
    assert.deepEqual(violations, []);
  });

  test("(a) 分類A の CE に対応する .css が存在する", () => {
    const classA = discoverClassAComponents();
    const violations = classA
      .filter((c) => {
        const cssPath = join(
          PUBLIC_ASSETS_ROOT,
          ...c.areaNamespace.split("/"),
          "client",
          "components",
          `${c.relFromComponentsDir}.css`,
        );
        return !existsSync(cssPath);
      })
      .map(
        (c) =>
          `${c.areaNamespace}/client/components/${c.relFromComponentsDir}.ts`,
      );
    assert.deepEqual(violations, []);
  });

  test("(b) 対応する CE の無い .css が components/ 配下に存在しない（styles/ は対象外）", () => {
    const classA = discoverClassAComponents();
    const componentCssRelPaths = allPublicCssFiles
      .map((f) => toPosix(relative(PUBLIC_ASSETS_ROOT, f)))
      .filter((rel) => classifyPublicAsset(rel).kind === "components");
    const violations = componentCssRelPaths.filter((rel) => {
      const meta = classifyPublicAsset(rel);
      const idx = rel.indexOf("/client/components/");
      const nameNoExt = rel
        .slice(idx + "/client/components/".length)
        .replace(/\.css$/, "");
      return !classA.some(
        (c) =>
          c.areaNamespace === meta.areaNamespace &&
          c.relFromComponentsDir === nameNoExt,
      );
    });
    assert.deepEqual(violations, []);
  });
});

// ============================================================================
// §12.4-40: public/ の拡張子制限
// ============================================================================

describe("§12.4-40 public/ に .ts / .map / .d.ts / .json / ドットファイルが無い", () => {
  test("public/ 配下に禁止拡張子・ドットファイルが無い", () => {
    const violations = allPublicFiles
      .filter((f) => {
        const base = f.split(sep).pop() ?? "";
        if (base.startsWith(".")) return true;
        return (
          base.endsWith(".ts") ||
          base.endsWith(".map") ||
          base.endsWith(".d.ts") ||
          base.endsWith(".json")
        );
      })
      .map((f) => toPosix(relative(REPO_ROOT, f)));
    assert.deepEqual(violations, []);
  });
});

// ============================================================================
// §12.4-41: src/ に .ts / tsconfig.json 以外を置かない
// ============================================================================

describe("§12.4-41 src/ の許容ファイル種別", () => {
  test("src/ 配下に .ts と tsconfig.json 以外のファイルが無い", () => {
    const violations = listFilesRecursive(SRC_ROOT)
      .filter(
        (f) => !(f.endsWith(".ts") || f.split(sep).pop() === "tsconfig.json"),
      )
      .map((f) => toPosix(relative(REPO_ROOT, f)));
    assert.deepEqual(violations, []);
  });
});

// ============================================================================
// §12.4-50: docs/ 配下と README の npm run <name> が package.json の scripts に実在する
// ============================================================================

describe("§12.4-50 npm run <name> の実在確認", () => {
  test("docs/ 配下と README.md の npm run <name> がすべて package.json の scripts に実在する", () => {
    const pkg = JSON.parse(readFileSync(packageJsonPath, "utf8")) as {
      scripts?: Record<string, string>;
    };
    const scriptNames = new Set(Object.keys(pkg.scripts ?? {}));
    const readmePath = join(REPO_ROOT, "README.md");
    const targetFiles = [
      ...listFilesRecursive(DOCS_ROOT).filter((f) => f.endsWith(".md")),
      ...(existsSync(readmePath) ? [readmePath] : []),
    ];
    const missing: string[] = [];
    for (const f of targetFiles) {
      const text = readFileSync(f, "utf8");
      // リテラル部分と、それに続くプレースホルダ（<host> 等）を分けて捕捉する。
      // 規約 §12.4-50 のプレースホルダ規則:
      //   - プレースホルダなし        → scripts と完全一致（緩めない）
      //   - リテラルあり + <…>        → リテラルを接頭辞として前方一致が1つ以上あればよい
      //   - リテラルが空（npm run <name>）→ 検査対象外（接頭辞が空だと検査が無意味になるため、
      //     「たまたま抽出されない」ではなく意図的に除外する。本項の条文自身がこの形を含む）
      const re = /npm run ([a-zA-Z0-9:_-]*)(<[^<>\s]*>)?/g;
      let m: RegExpExecArray | null = re.exec(text);
      while (m !== null) {
        const literal = m[1] ?? "";
        const hasPlaceholder = m[2] !== undefined;
        const shown = `npm run ${literal}${m[2] ?? ""}`;
        if (hasPlaceholder) {
          if (literal !== "") {
            const anyPrefixed = [...scriptNames].some((s) =>
              s.startsWith(literal),
            );
            if (!anyPrefixed) {
              missing.push(`${toPosix(relative(REPO_ROOT, f))}: ${shown}`);
            }
          }
          // literal === "" は意図的に検査対象外（上記コメント）
        } else if (literal !== "" && !scriptNames.has(literal)) {
          missing.push(`${toPosix(relative(REPO_ROOT, f))}: ${shown}`);
        }
        m = re.exec(text);
      }
    }
    assert.deepEqual(missing, []);
  });
});

// ============================================================================
// §12.4-52: resolveRepoRoot( の呼び出し元許可リスト
// ============================================================================

describe("§12.4-52 resolveRepoRoot の呼び出し元許可リスト", () => {
  const DEFINITION_FILE = "platform/server/runtime/repo-root.ts";
  /**
   * ホスト名を列挙せず、パターンで表現する（ホストを1つ追加しても本検査を変更しなくてよいようにするため）。
   * 用途説明: `resolveRepoRoot` は `<repo>` を `import.meta.url` から3階層遡って求める（§6.5・裁定38）。
   * この不変条件（`dist/hosts/<h>/main.js` と `src/hosts/<h>/main.ts` がリポジトリ直下から3階層下）が
   * 成り立つのは合成ルート（各ホストの main.ts）だけであり、他所から呼ぶと例外も型エラーも出さずに
   * 誤ったディレクトリ（`dist/` 自身等）を返す（§12.4-52 の本文）。
   */
  const ALLOWLIST: readonly AllowlistEntry[] = [
    {
      pattern: /^hosts\/[^/]+\/main\.ts$/,
      reason:
        "各ホストの合成ルートだけが import.meta.url を渡して <repo> を解決してよい唯一の場所（§6.5 / 裁定38）",
    },
  ];

  test("許可リストの全エントリに用途説明がある", () => {
    assertAllowlistHasReasons(ALLOWLIST, "§12.4-52");
  });

  test("resolveRepoRoot( の呼び出しが許可リストのパターン以外に無い", () => {
    const pattern = /\bresolveRepoRoot\s*\(/;
    const violations: string[] = [];
    for (const f of allTsFiles) {
      const meta = classify(f);
      if (meta.relPath === DEFINITION_FILE) continue;
      if (!pattern.test(readStripped(f))) continue;
      if (!ALLOWLIST.some((e) => e.pattern.test(meta.relPath)))
        violations.push(meta.relPath);
    }
    assert.deepEqual(violations, []);
  });

  test("許可された各ホストが実際に resolveRepoRoot を呼んでいる（許可の空振り防止）", () => {
    for (const h of hostNames) {
      const p = join(HOSTS_DIR, h, "main.ts");
      assert.match(
        readStripped(p),
        /\bresolveRepoRoot\s*\(/,
        `hosts/${h}/main.ts が resolveRepoRoot を呼んでいない`,
      );
    }
  });
});

// ============================================================================
// §12.4-53: 追跡対象の公開物に、開発支援ディレクトリ配下のファイルへの名指し参照が無い
// ============================================================================

describe("§12.4-53 公開物からの非公開ディレクトリ参照の禁止", () => {
  test("追跡対象の公開物が、開発支援ディレクトリ配下のファイルを名指ししていない", () => {
    // 検出するのは「ディレクトリ名の直後にパス区切りとファイル名が続く形」だけである。
    // `.gitignore` の除外パターンとしてディレクトリ名だけを書いた記述（規約 §6.5 / §11.6）は
    // **参照ではなく除外設定そのもの**なので違反にしない。用途: `.gitignore` の必須項目を規定するため。
    // これが唯一の除外であり、ファイル単位の除外リストは持たない（増える一方になるため。§12.4-3）。
    // 正規表現の綴りに `\` を挟んでいるのは、この検査が自分自身の実装に当たらないようにするため。
    const named = /\.hw\/[A-Za-z0-9_.-]/;

    const rootAssets = existsSync(REPO_ROOT)
      ? readdirSync(REPO_ROOT, { withFileTypes: true })
          .filter((e) => e.isFile())
          .map((e) => join(REPO_ROOT, e.name))
      : [];
    const targets = [
      ...listFilesRecursive(DOCS_ROOT),
      ...listFilesRecursive(SRC_ROOT),
      ...listFilesRecursive(join(REPO_ROOT, "tests")),
      ...listFilesRecursive(PUBLIC_ROOT),
      ...listFilesRecursive(join(REPO_ROOT, "db")),
      ...rootAssets,
    ];

    const violations: string[] = [];
    for (const f of targets) {
      if (named.test(readFileSync(f, "utf8"))) {
        violations.push(toPosix(relative(REPO_ROOT, f)));
      }
    }
    assert.deepEqual(violations, []);
  });
});

// ============================================================================
// §12.4-9 チェッカー自身の自己回帰テスト（sec-audit L-2 / qa N4）
//
// 実ファイル走査だけでは、src/ に該当パターンが無い間ロジックが無検証のまま埋もれる。
// フィクスチャはインライン文字列で与える（src/ に置くと §12.4-41 に違反するため）。
// ============================================================================

/**
 * 自己回帰テスト用。**実ファイル走査と同一の関数**（`scanUrlAttrInterpolations`）を呼ぶ。
 * ここでロジックを書き写してはならない（書き写すと実装の劣化を検知できなくなる）。
 */
function countUrlAttrViolations(tmpl: string): number {
  return scanUrlAttrInterpolations(tmpl).length;
}

describe("§12.4-9 チェッカーの自己回帰テスト", () => {
  const D = "$" + "{"; // 補間の開き。テンプレートリテラルとして評価させないため分割して綴る
  const cases: ReadonlyArray<
    readonly [name: string, tmpl: string, expected: number]
  > = [
    ["属性値の先頭が補間・未経由", `<a href="${D}x}">y</a>`, 1],
    ["静的接頭辞つき（旧アンカリング欠陥）", `<a href="/next/${D}x}">y</a>`, 1],
    ["値に = を含む（-10 との横取り）", `<a href="/next?url=${D}x}">y</a>`, 1],
    ["2つ目の補間が未経由", `<a href="${D}attrUrl(u)}&r=${D}x}">y</a>`, 1],
    [
      "補間の内側に引用符（入れ子）",
      `<a href="${D}attrUrl("/a")}/x/${D}y}">z</a>`,
      1,
    ],
    ["規約どおり attrUrl 経由（緑）", `<a href="${D}attrUrl(u)}">y</a>`, 0],
    [
      "規約どおり attrSrcset 経由（緑）",
      `<img srcset="${D}attrSrcset(s)}">`,
      0,
    ],
    ["補間が無い静的な属性値（緑）", `<a href="/next">y</a>`, 0],
    [
      "CSS url() の先頭が補間・未経由",
      `<div style="background:url(${D}x})">`,
      1,
    ],
    [
      "CSS url() に静的接頭辞",
      `<div style="background:url(/img/${D}x}.png)">`,
      1,
    ],
    [
      "CSS url() が attrUrl 経由（緑）",
      `<div style="background:url(${D}attrUrl(u)})">`,
      0,
    ],
  ];

  for (const [name, tmpl, expected] of cases) {
    test(`${name} → 違反 ${expected} 件`, () => {
      assert.equal(countUrlAttrViolations(tmpl), expected);
    });
  }

  test("補間式内の裸の { が深さ計算を崩さない（qa N4 の是正）", () => {
    // 式中の文字列リテラルに単独の { / } があっても閉じ位置を誤判定しないこと。
    // 誤判定すると走査開始位置がずれ、後続の補間を取りこぼす（＝検出漏れ）。
    const ok = `<a href="${D}attrUrl(x === "{" ? a : b)}">y</a>`;
    assert.equal(countUrlAttrViolations(ok), 0, "規約どおりの形は緑であること");

    // 同じ形で2つ目の補間が未経由なら、そちらは確実に検出されること
    const ng = `<a href="${D}attrUrl(x === "{" ? a : b)}/p/${D}y}">z</a>`;
    assert.equal(
      countUrlAttrViolations(ng),
      1,
      "裸の { を含んでも2つ目の補間を取りこぼさないこと",
    );
  });
});

// ============================================================================
// §12.4-54: §11.6 / §2.1 が要求するリポジトリ直下の資材が実在する
// ============================================================================

/**
 * 規約 §11.6 の「リポジトリ直下に置く資材」表と §2.1 のツリーの和集合（14件）。
 *
 * **規約の表／ツリーを実行時にパースする実装は採らない**（表は結合セルを含み、ツリーは罫線付きの
 * 図であるため、パーサが壊れて「0件走査で緑」になる危険のほうが大きい。§12.4 冒頭の 0 件アサートと
 * 同じ失敗モード）。**この集合はサービス数・エリア数に比例しない固定集合**であり、
 * 「サービス名をハードコードしない」という §12.4 の原則には抵触しない。
 * **増減させるときは規約 §12.4-54 の一覧と本定数の両方を同時に直すこと。**
 */
const REQUIRED_ROOT_ASSETS = [
  "LICENSE",
  "README.md",
  ".gitignore",
  ".npmrc",
  "package-lock.json",
  "biome.json",
  ".editorconfig",
  ".env.example",
  ".node-version",
  "CLAUDE.md",
  "package.json",
  "tsconfig.json",
  "tsconfig.base.json",
  "tsconfig.test.shared.json",
  "tsconfig.test.server.json",
  "tsconfig.test.client.json",
] as const;

/**
 * 直下ではないが規約 §11.6 が実在を要求する資材（§12.4-54 の対象B）。
 * 42〜51 は `docs/` 配下の文書の「中身の突合」しか行っておらず、実在そのものは確かめていない。
 */
const REQUIRED_NON_ROOT_ASSETS = ["docs/manual-checklist.md"] as const;

describe("§12.4-54 規約が実在を要求する資材", () => {
  test("§11.6 / §2.1 が要求する直下資材がすべて実在する", () => {
    const missing = REQUIRED_ROOT_ASSETS.filter(
      (name) => !existsSync(join(REPO_ROOT, name)),
    );
    assert.deepEqual(missing, []);
  });

  test("直下ではないが §11.6 が要求する資材が実在する", () => {
    const missing = REQUIRED_NON_ROOT_ASSETS.filter(
      (rel) => !existsSync(join(REPO_ROOT, ...rel.split("/"))),
    );
    assert.deepEqual(missing, []);
  });

  test(".node-version が package.json の engines.node と矛盾しない", () => {
    // 版を強制する2枚が食い違うと、どちらを信じるかが実行環境ごとに変わる（§11.6）
    const major = readFileSync(join(REPO_ROOT, ".node-version"), "utf8").trim();
    assert.match(major, /^\d+$/, ".node-version はメジャー版のみを書く");
    const pkg = JSON.parse(readFileSync(packageJsonPath, "utf8")) as {
      engines?: { node?: string };
    };
    const engines = pkg.engines?.node;
    assert.ok(engines !== undefined, "package.json に engines.node が無い");
    assert.ok(
      engines.includes(major),
      `engines.node（${engines}）と .node-version（${major}）が食い違っている`,
    );
  });

  test("LICENSE が空ファイルでない", () => {
    // 存在するだけを条件にすると「空ファイルを置いて検査を通す」抜け道が開く（§11.6）
    const p = join(REPO_ROOT, "LICENSE");
    assert.ok(existsSync(p), "LICENSE が存在しない");
    assert.ok(
      readFileSync(p, "utf8").trim().length > 0,
      "LICENSE が空（規約 §11.6 は空ファイルを禁じている）",
    );
  });

  test("package.json の license 宣言が LICENSE の本文と一致する", () => {
    // メタデータだけがライセンスを主張し実体が無い／食い違う状態を捕まえる
    const pkg = JSON.parse(readFileSync(packageJsonPath, "utf8")) as {
      license?: string;
    };
    const declared = pkg.license;
    assert.ok(
      declared !== undefined && declared.length > 0,
      "package.json に license フィールドが無い",
    );
    const text = readFileSync(join(REPO_ROOT, "LICENSE"), "utf8");
    assert.ok(
      text.includes(declared),
      `LICENSE の本文に package.json の license 宣言（${declared}）が現れない`,
    );
  });
});
