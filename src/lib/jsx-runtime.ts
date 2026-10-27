/**
 * JSX の変換先。deno.json の compilerOptions（jsx: "precompile"）により、.tsx の JSX は、このモジュールの関数の
 * 呼び出しに変換される。JSX の値は、エスケープ済みの HTML を表す Html になる。
 *
 * precompile は、タグの固定部分をあらかじめ文字列にし、`{...}` の値だけを jsxEscape・jsxAttr に渡す。
 * コンポーネントと、属性を `{...props}` で展開した要素は jsx に渡す。
 * どの関数も precompile が出力したコードから呼ばれるもので、ページから直接呼ぶものではない。
 *
 * 属性を型チェックするのは html-attributes.ts にあるタグだけで、ほかのタグにはどの属性でも書ける。
 * 埋め込んだ値は、Html 以外はすべてエスケープする。
 *
 * ページの大きさに比例して呼ばれるので、コールバックや中間の配列を作らないよう、ループで書いている。
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
// HTML の構文で属性名に使えない文字。
const INVALID_ATTR_NAME = /[\s"'>/=\p{Cc}]/u;

// クラスは型だけを公開し、ページのコードで文字列から Html を作りにくくしている。
// ただし、constructor をたどったり jsxTemplate を直接呼んだりすれば作れるので、偽造を防ぐ仕組みではない。
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
 * templates の間に exprs を挟んでつなぎ、Html にする。
 * exprs は、jsxEscape・jsxAttr の戻り値か、precompile が出力した文字列か、jsx の戻り値。
 * `{null}` と書くと、precompile は jsxEscape を通さずに null を渡す。
 */
export function jsxTemplate(templates: Array<string>, ...exprs: Array<unknown>): Html {
  let html = templates[0];
  for (let i = 0; i < exprs.length; i++) {
    const expr = exprs[i];
    html += (expr instanceof Html ? expr.value : expr ?? "") + templates[i + 1];
  }
  return new Html(html);
}

/**
 * `{...}` で埋め込んだ値を HTML の文字列にする。文字列・数値はエスケープし、Html はそのまま、
 * true・false・null・undefined は空文字列にする。配列は要素ごとに変換して連結する。それ以外の値は例外を投げる。
 */
export function jsxEscape(value: unknown): string {
  if (value instanceof Html) {
    return value.value;
  }
  if (Array.isArray(value)) {
    let html = "";
    for (let i = 0; i < value.length; i++) html += jsxEscape(value[i]);
    return html;
  }
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
  throw new TypeError(`JSX に埋め込めない値です: ${Object.prototype.toString.call(value)}`);
}

/**
 * 属性を `name="value"` の形にする。true なら属性名だけを、false・null・undefined なら空文字列を返す。
 * aria-* は値のない形を true として扱わないので、true・false を文字列にして出力する。
 */
export function jsxAttr(name: string, value: unknown): string {
  if (INVALID_ATTR_NAME.test(name)) {
    throw new TypeError(`属性名に使えません: ${name}`);
  }
  switch (typeof value) {
    case "string":
    case "number":
    case "bigint":
      return `${name}="${escapeHtml(String(value))}"`;
    case "boolean":
      if (name.startsWith("aria-")) {
        return `${name}="${value}"`;
      }
      return value ? name : "";
    case "undefined":
      return "";
  }
  if (value === null) return "";
  throw new TypeError(`属性 ${name} に使えない値です: ${Object.prototype.toString.call(value)}`);
}

/** type がタグ名なら要素を、関数ならコンポーネントを呼んだ結果を Html にする。 */
export function jsx(
  type: string | ((props: Record<string, unknown>) => unknown),
  // precompile は、属性のないコンポーネント（<C />）には null を渡す。
  props: Record<string, unknown> | null,
): Html {
  props ??= {};
  // コンポーネントが文字列を返しても、HTML としては扱わずにエスケープする。
  if (typeof type === "function") {
    return new Html(jsxEscape(type(props)));
  }
  // Object.entries と同じく、自身の列挙可能なプロパティだけを、同じ順番で読む。
  let open = "<" + type;
  for (const name in props) {
    if (name === "children" || !Object.hasOwn(props, name)) continue;
    const attr = jsxAttr(name, props[name]);
    if (attr !== "") {
      open += " " + attr;
    }
  }
  if (VOID_ELEMENTS.has(type)) {
    return new Html(open + ">");
  }
  return new Html(`${open}>${jsxEscape(props.children)}</${type}>`);
}

/** `<>...</>` の変換先。children をタグで包まずにそのまま並べる。 */
export function Fragment({ children }: { children?: unknown }): Html {
  return new Html(jsxEscape(children));
}

// エスケープする文字がない値（ほとんどの値がそう）は、新しい文字列を作らずにそのまま返す。
function escapeHtml(value: string) {
  let html = "";
  let last = 0;
  for (let i = 0; i < value.length; i++) {
    let entity: string;
    switch (value.charCodeAt(i)) {
      case 0x26:
        entity = "&#38;";
        break;
      case 0x3c:
        entity = "&#60;";
        break;
      case 0x3e:
        entity = "&#62;";
        break;
      case 0x22:
        entity = "&#34;";
        break;
      case 0x27:
        entity = "&#39;";
        break;
      default:
        continue;
    }
    html += value.slice(last, i) + entity;
    last = i + 1;
  }
  return last === 0 ? value : html + value.slice(last);
}
