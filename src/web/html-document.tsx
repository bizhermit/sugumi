import type { Html } from "#jsx/jsx-runtime";

export type HtmlTitle = string | ((outer: string | undefined) => string);

export type Slots = {
  readonly main: Html;
  readonly [name: string]: Html | undefined;
};

export type Layout = {
  readonly title?: HtmlTitle;
  // readonly styles?: string[]; // TODO
  // readonly scripts?: string[]; // TODO
  readonly render?: (slots: Slots) => Html;
};

export type PageOptions = {
  readonly title?: HtmlTitle;
  // readonly styles?: string[]; // TODO
  // readonly scripts?: string[]; // TODO
  readonly slots: Slots;
  readonly status?: number;
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

function applyTitle(outer: string | undefined, title: HtmlTitle | undefined): string | undefined {
  if (typeof title === "string") {
    return title;
  }
  if (title == null) {
    return outer;
  }
  return title(outer);
}

function compose(target: Page) {
  const { layouts, options } = target;
  let title: string | undefined;
  for (let i = 0, il = layouts.length; i < il; i++) {
    title = applyTitle(title, layouts[i]?.title);
  }
  title = applyTitle(title, options.title);
  const current = { ...options.slots };
  for (let i = layouts.length - 1; i >= 0; i--) {
    const render = layouts[i]?.render;
    if (render == null) continue;
    current.main = render(current);
  }

  return {
    title,
    elements: current.main,
  } as const;
}

export function htmlDocument(target: Page): Response {
  const { title, elements } = compose(target);

  const html = (
    <html lang="ja">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>{title}</title>
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
