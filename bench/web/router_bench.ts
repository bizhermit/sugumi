import { loadRouter } from "../../src/web/router.ts";
import { handler, withFixture } from "../../tests/_support/routes.ts";

// ルートの数に比例する部分を測るため、機能が増えたときを想定して 40 の機能にそれぞれ一覧・詳細・編集を置く
const FEATURES = 40;
const files: Record<string, string> = {};
for (let i = 0; i < FEATURES; i++) {
  files[`f${i}/get.ts`] = handler(`f${i}`);
  files[`f${i}/[id]/get.ts`] = handler(`f${i} detail`);
  files[`f${i}/[id]/edit/get.ts`] = handler(`f${i} edit`);
}
let match!: Awaited<ReturnType<typeof loadRouter>>;
// 読み込んだモジュールは消した後も使えるため、ディレクトリは読み込んだらすぐ消す
await withFixture(files, async (root) => {
  match = await loadRouter({ mock: false, root });
});

const last = FEATURES - 1;

Deno.bench("静的なルート", { group: "router", baseline: true }, () => {
  match(`/f${last}`, "GET");
});

Deno.bench("動的なルート（最後に並ぶもの）", { group: "router" }, () => {
  match(`/f${last}/123/edit`, "GET");
});

Deno.bench("どれにも照合しない", { group: "router" }, () => {
  match("/nothing/here/at/all", "GET");
});
