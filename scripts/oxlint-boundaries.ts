import { dirname, resolve, sep } from "node:path";

/**
 * oxlint用プラグイン
 * ファイルの置き場所（_client/・_shared/・それ以外）ごとに、import してよいファイルを制限する。
 */

type Zone = "client" | "shared" | "server";

const ZONE_LABELS: Readonly<Record<Zone, string>> = {
  client: "_client/",
  shared: "_shared/",
  server: "サーバー",
};

const ALLOWED: Readonly<Record<Zone, readonly Zone[]>> = {
  client: ["client", "shared"],
  shared: ["shared"],
  server: ["shared", "server"],
};

function zoneOf(path: string): Zone {
  const names = path.split(sep);
  if (names.includes("_client")) return "client";
  if (names.includes("_shared")) return "shared";
  return "server";
}

type Context = {
  readonly filename: string;
  readonly report: (descriptor: {
    readonly node: unknown;
    readonly messageId: "zone" | "package";
    readonly data: Readonly<Record<string, string>>;
  }) => void;
};

type NodeWithSource = {
  readonly source?: { readonly value?: unknown } | null;
};

const imports = {
  meta: {
    type: "problem",
    messages: {
      zone: "{{from}}のコードから{{to}}のコード（{{source}}）はimportできません。",
      package: "{{from}}のコードからパッケージ（{{source}}）はimportできません。",
    },
    schema: [],
  },
  create(context: Context) {
    const from = zoneOf(context.filename);

    function check({ source }: NodeWithSource): void {
      // 文字列でない指定（変数を渡す動的 import など）は、行き先が分からないので対象にしない。
      if (source == null || typeof source.value !== "string") return;

      const value = source.value;
      if (!value.startsWith(".")) {
        // node: を含むパッケージはブラウザで動く保証がなく、サーバー専用のコードを持ち込む経路にもなる。
        if (from !== "server") {
          context.report({ node: source, messageId: "package", data: { from: ZONE_LABELS[from], source: value } });
        }
        return;
      }

      const to = zoneOf(resolve(dirname(context.filename), value));
      if (!ALLOWED[from].includes(to)) {
        context.report({
          node: source,
          messageId: "zone",
          data: { from: ZONE_LABELS[from], to: ZONE_LABELS[to], source: value },
        });
      }
    }

    return {
      ImportDeclaration: check,
      ExportNamedDeclaration: check,
      ExportAllDeclaration: check,
      ImportExpression: check,
    };
  },
};

export default {
  meta: { name: "boundaries" },
  rules: { imports },
};
