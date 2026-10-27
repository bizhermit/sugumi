import { mailtoUrl, path, safeUrl, telUrl } from "../../src/web/url.ts";

// リンクの数に比例する部分なので、1 ページに 100 個のリンクを作る想定で測る。
Deno.bench("path() 100 回（クエリなし）", { group: "path", baseline: true }, () => {
  for (let i = 0; i < 100; i++) path("/home");
});

Deno.bench("path() 100 回（クエリあり）", { group: "path" }, () => {
  for (let i = 0; i < 100; i++) path("/login", { query: { to: `/home?i=${i}`, expired: null } });
});

// ユーザーが入力した URL を出すリンクも、ページのリンクの数に比例して呼ばれる。
Deno.bench("safeUrl() 100 回（絶対 URL）", { group: "safeUrl", baseline: true }, () => {
  for (let i = 0; i < 100; i++) safeUrl(`https://example.com/users/${i}?tab=a`);
});

Deno.bench("safeUrl() 100 回（アプリ内のパス）", { group: "safeUrl" }, () => {
  for (let i = 0; i < 100; i++) safeUrl(`/home?i=${i}`);
});

Deno.bench("mailtoUrl() 100 回", { group: "contact" }, () => {
  for (let i = 0; i < 100; i++) mailtoUrl(`user.${i}+tag@example.co.jp`);
});

Deno.bench("telUrl() 100 回", { group: "contact" }, () => {
  for (let i = 0; i < 100; i++) telUrl(`03-1234-${1000 + i}`);
});
