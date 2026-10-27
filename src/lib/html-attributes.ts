/**
 * JSX で属性を型チェックするタグと、その属性。jsx-runtime.ts の JSX.IntrinsicElements で使う。
 * ここにないタグには、どの属性でも書ける。ここにあるタグに属性が足りなければ、仕様を確かめて足す。
 *
 * TypeScript は `-` を含む属性名（data-*・aria-* など）をチェックしないので、ここには書かない。
 * on* と style は CSP で使えないので、型に入れず、書くとエラーになるようにしている。
 * 各型は Record<string, unknown> に代入できるよう、interface ではなく type で書く。
 *
 * Chrome・Firefox・Safari のどれかが対応していれば入れ、対応していないブラウザは行末の「未対応：」に書く。
 * 追加と更新は .claude/skills/html-attribute-types/ のスキルで行う。
 */

/** 数値の属性は、`{1}` と `"1"` のどちらでも書ける。 */
type Num = number | `${number}`;

type Global = {
  id?: string;
  class?: string;
  title?: string;
  lang?: string;
  dir?: "ltr" | "rtl" | "auto";
  hidden?: boolean | "until-found"; // until-found は一部対応：Safari（2026-10 時点）
  inert?: boolean;
  tabindex?: Num;
  accesskey?: string;
  autofocus?: boolean;
  role?: string;
  translate?: "yes" | "no";
  spellcheck?: "true" | "false";
  autocapitalize?: "off" | "none" | "on" | "sentences" | "words" | "characters"; // 未対応：Safari（デスクトップ）（2026-10 時点）
  autocorrect?: "on" | "off";
  inputmode?: "none" | "text" | "decimal" | "numeric" | "tel" | "search" | "email" | "url";
  enterkeyhint?: "enter" | "done" | "go" | "next" | "previous" | "search" | "send";
  contenteditable?: "true" | "false" | "plaintext-only";
  draggable?: "true" | "false";
  popover?: boolean | "auto" | "manual" | "hint"; // hint は未対応：Safari（2026-10 時点）
  writingsuggestions?: "true" | "false"; // 未対応：Firefox（2026-10 時点）
  virtualkeyboardpolicy?: "auto" | "manual"; // 未対応：Firefox・Safari（2026-10 時点）
  elementtiming?: string; // 未対応：Firefox・Safari（2026-10 時点）
  nonce?: string;
  is?: string; // 未対応：Safari（2026-10 時点）
  part?: string;
  exportparts?: string;
  slot?: string;
  itemscope?: boolean;
  itemtype?: string;
  itemid?: string;
  itemprop?: string;
  itemref?: string;
};
type Parent = Global & { children?: unknown };
type Void = Global;

type Target = "_blank" | "_self" | "_parent" | "_top";
type ReferrerPolicy =
  | "no-referrer"
  | "no-referrer-when-downgrade" // 未対応：Firefox・Safari（2026-10 時点）
  | "origin"
  | "origin-when-cross-origin" // 未対応：Firefox・Safari（2026-10 時点）
  | "same-origin"
  | "strict-origin"
  | "strict-origin-when-cross-origin"
  | "unsafe-url"; // 未対応：Firefox・Safari（2026-10 時点）
type FormMethod = "get" | "post" | "dialog";
type FormEnctype = "application/x-www-form-urlencoded" | "multipart/form-data" | "text/plain";

// section-*・home・work などの接頭辞は、使うときに足す。
type AutofillField =
  | "name"
  | "honorific-prefix"
  | "given-name"
  | "additional-name"
  | "family-name"
  | "honorific-suffix"
  | "nickname"
  | "username"
  | "new-password"
  | "current-password"
  | "one-time-code"
  | "organization-title"
  | "organization"
  | "street-address"
  | "address-line1"
  | "address-line2"
  | "address-line3"
  | "address-level1"
  | "address-level2"
  | "address-level3"
  | "address-level4"
  | "country"
  | "country-name"
  | "postal-code"
  | "cc-name"
  | "cc-given-name"
  | "cc-additional-name"
  | "cc-family-name"
  | "cc-number"
  | "cc-exp"
  | "cc-exp-month"
  | "cc-exp-year"
  | "cc-csc"
  | "cc-type"
  | "transaction-currency"
  | "transaction-amount"
  | "language"
  | "bday"
  | "bday-day"
  | "bday-month"
  | "bday-year"
  | "sex"
  | "url"
  | "photo"
  | "tel"
  | "tel-country-code"
  | "tel-national"
  | "tel-area-code"
  | "tel-local"
  | "tel-extension"
  | "email"
  | "impp";
type Autocomplete =
  | "on"
  | "off"
  | AutofillField
  | `${"shipping" | "billing"} ${AutofillField}`
  | `${AutofillField} webauthn`;

/** フォームの外にあるボタンなどから、送信先や送信方法を上書きする属性。 */
type FormOverride = {
  form?: string;
  formaction?: string;
  formmethod?: FormMethod;
  formenctype?: FormEnctype;
  formnovalidate?: boolean;
  formtarget?: Target;
};
type PopoverTarget = {
  popovertarget?: string;
  popovertargetaction?: "toggle" | "show" | "hide";
};
type FormControl = {
  name?: string;
  disabled?: boolean;
  form?: string;
};

type InputType =
  | "text"
  | "search"
  | "tel"
  | "url"
  | "email"
  | "password"
  | "date"
  | "month" // 未対応：Firefox・Safari（デスクトップ）（2026-10 時点）
  | "week" // 未対応：Firefox・Safari（デスクトップ）（2026-10 時点）
  | "time"
  | "datetime-local"
  | "number"
  | "range"
  | "color"
  | "checkbox"
  | "radio"
  | "file"
  | "hidden"
  | "submit"
  | "reset"
  | "button"
  | "image";

type Cell = Parent & { colspan?: Num; rowspan?: Num; headers?: string };

export type HtmlElements = {
  div: Parent;
  span: Parent;
  p: Parent;
  br: Void;
  h1: Parent;
  h2: Parent;
  h3: Parent;
  h4: Parent;
  h5: Parent;
  h6: Parent;
  main: Parent;
  nav: Parent;
  header: Parent;
  footer: Parent;
  section: Parent;
  ul: Parent;
  li: Parent & { value?: Num };
  a: Parent & {
    href?: string;
    target?: Target;
    rel?: string;
    ping?: string; // 一部対応：Firefox（2026-10 時点）
    download?: boolean | string;
    hreflang?: string;
    type?: string;
    referrerpolicy?: ReferrerPolicy;
  };
  img: Void & {
    src: string;
    alt: string;
    srcset?: string;
    sizes?: string;
    width?: Num;
    height?: Num;
    loading?: "lazy" | "eager";
    decoding?: "sync" | "async" | "auto";
    fetchpriority?: "high" | "low" | "auto";
    crossorigin?: "anonymous" | "use-credentials";
    referrerpolicy?: ReferrerPolicy;
    ismap?: boolean;
    usemap?: string;
  };
  form: Parent & {
    action?: string;
    method?: FormMethod;
    enctype?: FormEnctype;
    autocomplete?: "on" | "off";
    novalidate?: boolean;
    target?: Target;
    name?: string;
    rel?: string;
  };
  label: Parent & { for?: string };
  input: Void & FormControl & FormOverride & PopoverTarget & {
    type?: InputType;
    value?: string | number;
    checked?: boolean;
    required?: boolean;
    readonly?: boolean;
    multiple?: boolean;
    placeholder?: string;
    autocomplete?: Autocomplete;
    min?: string | number;
    max?: string | number;
    step?: Num | "any";
    minlength?: Num;
    maxlength?: Num;
    size?: Num;
    pattern?: string;
    accept?: string;
    list?: string;
    dirname?: string;
    alt?: string;
    src?: string;
    width?: Num;
    height?: Num;
    capture?: "user" | "environment"; // 未対応：Chrome・Firefox・Safari（デスクトップ）（2026-10 時点）
    alpha?: boolean; // 未対応：Chrome・Firefox（2026-10 時点）
    colorspace?: "limited-srgb" | "display-p3"; // 未対応：Chrome・Firefox（2026-10 時点）
  };
  button: Parent & FormControl & FormOverride & PopoverTarget & {
    type?: "submit" | "reset" | "button";
    value?: string | number;
    command?:
      | "show-modal"
      | "close"
      | "request-close"
      | "show-popover"
      | "hide-popover"
      | "toggle-popover"
      | `--${string}`;
    commandfor?: string;
  };
  select: Parent & FormControl & {
    required?: boolean;
    multiple?: boolean;
    size?: Num; // 未対応：Safari（iOS）（2026-10 時点）
    autocomplete?: Autocomplete;
  };
  option: Parent & {
    value?: string | number;
    selected?: boolean;
    disabled?: boolean;
    label?: string;
  };
  textarea: Global & FormControl & {
    // 中身のテキストが初期値になる。タグを入れても HTML としては扱われない。
    children?: string;
    required?: boolean;
    readonly?: boolean;
    placeholder?: string;
    rows?: Num;
    cols?: Num;
    minlength?: Num;
    maxlength?: Num;
    wrap?: "soft" | "hard"; // hard は未対応：Firefox・Safari（2026-10 時点）
    // webauthn は未対応：Firefox・Safari、new-password は未対応：Chrome・Safari（2026-10 時点）
    autocomplete?: Autocomplete;
    dirname?: string;
  };
  table: Parent;
  thead: Parent;
  tbody: Parent;
  tr: Parent;
  th: Cell & { scope?: "row" | "col" | "rowgroup" | "colgroup"; abbr?: string };
  td: Cell;
  details: Parent & { open?: boolean; name?: string };
  summary: Parent;
  dialog: Parent & {
    open?: boolean;
    closedby?: "any" | "closerequest" | "none"; // 未対応：Safari（2026-10 時点）
  };
};
