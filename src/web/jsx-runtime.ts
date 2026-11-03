import type { HtmlElements } from "./html-attributes.ts";

class Html {
  readonly value: string;

  constructor(value: string) {
    this.value = value;
  }
}
export type { Html };

const INVALID_ATTR_NAME = /[\s"'>/=\p{Cc}]/u;

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

type Props = Readonly<Record<string, unknown>>;
type Component = (props: Props) => unknown;

function typeName(value: unknown): string {
  return Object.prototype.toString.call(value);
}

function escapeHtml(value: string): string {
  let html = "";
  let last = 0;
  for (let i = 0; i < value.length; i++) {
    let entity: string;
    switch (value.charCodeAt(i)) {
      case 0x26:
        entity = "&amp;";
        break;
      case 0x3c:
        entity = "&lt;";
        break;
      case 0x3e:
        entity = "&gt;";
        break;
      case 0x22:
        entity = "&quot;";
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
  if (last === 0) return value;
  return html + value.slice(last);
}

function renderChildren(value: unknown): string {
  if (value instanceof Html) {
    return value.value;
  }
  if (Array.isArray(value)) {
    let html = "";
    for (const item of value) {
      html += renderChildren(item);
    }
    return html;
  }
  if (value === null) {
    return "";
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
    default:
      throw new TypeError(`JSXに埋め込めない値です: ${typeName(value)}`);
  }
}

function renderAttr(name: string, value: unknown): string {
  if (INVALID_ATTR_NAME.test(name)) {
    throw new TypeError(`属性名に使用できません: ${name}`);
  }
  if (value === null) {
    return "";
  }
  switch (typeof value) {
    case "string":
    case "number":
    case "bigint":
      return ` ${name}="${escapeHtml(String(value))}"`;
    case "boolean":
      // aria-* は値のない形を true として扱わないので、true・false を文字列で出す。
      if (name.startsWith("aria-")) {
        return ` ${name}="${value}"`;
      }
      return value ? ` ${name}` : "";
    case "undefined":
      return "";
    default:
      throw new TypeError(`属性"${name}"に使用できない値です: ${typeName(value)}`);
  }
}

export function jsx(type: string | Component, props: Props): Html {
  // コンポーネントが文字列を返しても、HTML としては扱わずにエスケープする。
  if (typeof type === "function") {
    return new Html(renderChildren(type(props)));
  }
  let open = `<${type}`;
  for (const [name, value] of Object.entries(props)) {
    if (name !== "children") {
      open += renderAttr(name, value);
    }
  }
  if (VOID_ELEMENTS.has(type)) {
    return new Html(`${open}>`);
  }
  return new Html(`${open}>${renderChildren(props.children)}</${type}>`);
}

// 子が複数のときにtscが呼ぶ。この実装では区別しない。
export const jsxs = jsx;

export function Fragment(props: Props): Html {
  return new Html(renderChildren(props.children));
}

export declare namespace JSX {
  type Element = Html;
  interface IntrinsicElements extends HtmlElements {
    [tag: string]: Record<string, unknown>;
  }
  interface ElementChildrenAttribute {
    children: unknown;
  }
}
