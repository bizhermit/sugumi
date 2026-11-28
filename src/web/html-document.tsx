import type { Html } from "#jsx/jsx-runtime";
import type { I18nAddon } from "../lib/_shared/i18n.ts";
import { i18nSlot } from "./i18n.ts";

export type HtmlTitle = string | ((outer: string | undefined, req: Request) => string);

export type Slots = {
  readonly main: Html;
  readonly [name: string]: Html | undefined;
};

export type Layout = {
  readonly title?: HtmlTitle;
  readonly styles?: string[];
  readonly scripts?: string[];
  readonly i18n?: I18nAddon[];
  readonly render?: (params: { req: Request; slots: Slots }) => Html;
};

export type PageOptions = {
  readonly title?: HtmlTitle;
  readonly styles?: string[];
  readonly scripts?: string[];
  readonly slots: Slots;
  readonly status?: number | undefined;
  readonly headers?: Readonly<Record<string, string>>;
};

export class Page {
  readonly options: PageOptions;
  readonly layouts: readonly Layout[];

  constructor(options: PageOptions, layouts: readonly Layout[] = []) {
    this.options = options;
    this.layouts = layouts;
  }

  wrap(layout: Layout): Page {
    return new Page(this.options, [layout, ...this.layouts]);
  }
}

export function page(options: PageOptions): Page {
  return new Page(options);
}

function applyTitle(req: Request, outer: string | undefined, title: HtmlTitle | undefined): string | undefined {
  if (typeof title === "string") {
    return title;
  }
  if (title == null) {
    return outer;
  }
  return title(outer, req);
}

function compose(req: Request, target: Page) {
  const { layouts, options } = target;

  let title: string | undefined;
  const styles = new Set<string>();
  const scripts = new Set<string>();

  for (let i = 0, il = layouts.length; i < il; i++) {
    const layout = layouts[i];
    if (layout == null) continue;
    title = applyTitle(req, title, layout.title);
    for (const href of layout.styles ?? []) {
      styles.add(href);
    }
    for (const src of layout.scripts ?? []) {
      scripts.add(src);
    }
  }

  title = applyTitle(req, title, options.title);

  const current = { ...options.slots };
  for (let i = layouts.length - 1; i >= 0; i--) {
    const render = layouts[i]?.render;
    if (render == null) continue;
    current.main = render({ req, slots: current });
  }

  for (const used of current.main.assets) {
    for (const href of used.styles ?? []) {
      styles.add(href);
    }
    for (const src of used.scripts ?? []) {
      scripts.add(src);
    }
  }
  for (const href of options.styles ?? []) {
    styles.add(href);
  }
  for (const src of options.scripts ?? []) {
    scripts.add(src);
  }

  return {
    title,
    elements: current.main,
    styles: [...styles],
    scripts: [...scripts],
  } as const;
}

export function htmlDocument(req: Request, target: Page): Response {
  const { title, elements, styles, scripts } = compose(req, target);
  const i18n = i18nSlot.get(req);

  const html = (
    <html lang={i18n.locale}>
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>{title}</title>
        {styles.map((href) => (
          <link rel="stylesheet" href={href} />
        ))}
        {i18n.urls.map((url) => (
          <meta name="i18n" content={url} />
        ))}
        {scripts.map((src) => (
          <script type="module" src={src}></script>
        ))}
      </head>
      <body>{elements}</body>
    </html>
  );

  const headers = new Headers(target.options.headers);
  headers.set("content-type", "text/html; charset=utf-8");

  return new Response(`<!doctype html>\n${html.value}\n`, {
    status: target.options.status ?? 200,
    headers,
  });
}
