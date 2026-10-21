import { path } from "../../src/web/url.ts";

// リンクの数に比例する部分のため、1 ページに 100 個のリンクを作る想定で測る
Deno.bench("path() 100 回（クエリなし）", { group: "path", baseline: true }, () => {
  for (let i = 0; i < 100; i++) path("/home");
});

Deno.bench("path() 100 回（クエリあり）", { group: "path" }, () => {
  for (let i = 0; i < 100; i++) path("/login", { query: { to: `/home?i=${i}`, expired: null } });
});
