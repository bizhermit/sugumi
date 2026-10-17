/**
 * JSX の変換先。deno.json の compilerOptions（jsx: "precompile"）で、.tsx の JSX はこのモジュールの関数の
 * 呼び出しに変換される。JSX の値は、エスケープ済みの HTML を表す Html になる。
 *
 * precompile はタグの固定部分をあらかじめ文字列にし、`{...}` の値だけを jsxEscape・jsxAttr に渡す。
 * コンポーネントと、属性を `{...props}` で展開した要素は jsx に渡す。
 *
 * 属性を型チェックするのは html-attributes.ts にあるタグだけで、ほかのタグはどの属性でも書ける。
 * 埋め込んだ値は、Html 以外はすべてエスケープする。
 */
import type { HtmlElements } from "./html-attributes.ts";

const VOID_ELEMENTS = new Set([
  "area",
  "base",
  "br",
  "col",
  "embed",
  "hr",
  "img",
  "input",
  "link",
  "meta",
  "source",
  "track",
  "wbr",
]);
// HTML の構文で属性名に使えない文字
const INVALID_ATTR_NAME = /[\s"'>/=\p{Cc}]/u;

// クラスは型だけを公開し、ページのコードで文字列から Html を作りにくくしている。
// constructor を辿ったり jsxTemplate を直接呼んだりすれば作れるため、偽造を防ぐ仕組みではない
class Html {
  constructor(readonly value: string) {}
}
export type { Html };

export declare namespace JSX {
  type Element = Html;
  interface IntrinsicElements extends HtmlElements {
    [tag: string]: Record<string, unknown>;
  }
  interface ElementChildrenAttribute {
    children: unknown;
  }
}

/**
 * exprs は jsxEscape・jsxAttr の戻り値か、precompile が出力した文字列か、jsx の戻り値。
 * `{null}` と書くと、precompile は jsxEscape を通さずに null を渡す。
 */
export function jsxTemplate(templates: string[], ...exprs: unknown[]): Html {
  let html = templates[0];
  for (const [i, expr] of exprs.entries()) {
    html += (expr instanceof Html ? expr.value : expr ?? "") + templates[i + 1];
  }
  return new Html(html);
}

/** 文字列・数値はエスケープし、Html はそのまま、true・false・null・undefined は空にする。配列は連結する。 */
export function jsxEscape(value: unknown): string {
  if (value instanceof Html) return value.value;
  if (Array.isArray(value)) return value.map(jsxEscape).join("");
  switch (typeof value) {
    case "string":
      return escapeHtml(value);
    case "number":
    case "bigint":
      return String(value);
    case "boolean":
    case "undefined":
      return "";
  }
  if (value === null) return "";
  throw new TypeError(`JSX に埋め込めない値です：${Object.prototype.toString.call(value)}`);
}

/**
 * true は属性名だけ、false・null・undefined は属性を出力しない。
 * aria-* は値のない形を true と扱わないため、true・false を文字列で出力する。
 */
export function jsxAttr(name: string, value: unknown): string {
  if (INVALID_ATTR_NAME.test(name)) throw new TypeError(`属性名に使えません：${name}`);
  switch (typeof value) {
    case "string":
    case "number":
    case "bigint":
      return `${name}="${escapeHtml(String(value))}"`;
    case "boolean":
      if (name.startsWith("aria-")) return `${name}="${value}"`;
      return value ? name : "";
    case "undefined":
      return "";
  }
  if (value === null) return "";
  throw new TypeError(`属性 ${name} に使えない値です：${Object.prototype.toString.call(value)}`);
}

export function jsx(
  type: string | ((props: Record<string, unknown>) => unknown),
  // precompile は、属性のないコンポーネント（<C />）には null を渡す
  props: Record<string, unknown> | null,
): Html {
  props ??= {};
  // コンポーネントが文字列を返しても、HTML としては扱わずエスケープする
  if (typeof type === "function") return new Html(jsxEscape(type(props)));
  const { children, ...attrs } = props;
  const open = [type, ...Object.entries(attrs).map(([k, v]) => jsxAttr(k, v))]
    .filter(Boolean).join(" ");
  if (VOID_ELEMENTS.has(type)) return new Html(`<${open}>`);
  return new Html(`<${open}>${jsxEscape(children)}</${type}>`);
}

export function Fragment({ children }: { children?: unknown }): Html {
  return new Html(jsxEscape(children));
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}
