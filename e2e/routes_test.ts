import assert from "node:assert/strict";
import type { Page } from "playwright";
import { GET_ROUTES, type RoutePath } from "../src/routes.gen.ts";
import { login, withPage } from "./_support/browser.ts";

// パラメータのあるルートは、開く URL をここに書く。書いていないと、テストが失敗する
const SAMPLE_URLS: Partial<Record<RoutePath, string>> = {};

/** route を開き、成功の応答（リダイレクトのあとを含む）になることを確かめる。 */
async function open(page: Page, route: RoutePath): Promise<void> {
  const url = route.includes("[") ? SAMPLE_URLS[route] : route;
  assert.ok(url !== undefined, `${route}: SAMPLE_URLS に開く URL を書いてください`);
  const res = await page.goto(url);
  assert.ok(res?.ok(), `${route}: ${res?.status()}`);
}

Deno.test("routes: ログインせずに、すべての画面を CSP の違反なく開く", async (t) => {
  for (const route of GET_ROUTES) {
    await t.step(route, () => withPage((page) => open(page, route)));
  }
});

Deno.test("routes: ログインして、すべての画面を CSP の違反なく開く", async (t) => {
  // GET でも状態を変えるルートがある（/login はログアウトする）ため、ルートごとにログインし直す
  for (const route of GET_ROUTES) {
    await t.step(route, () =>
      withPage(async (page) => {
        await login(page);
        await open(page, route);
      }));
  }
});

Deno.test("routes: 画面の JS・CSS を読み込む", async () => {
  // 読み込みに失敗したものや止められたものは、ブラウザがコンソールのエラーとして出し、withPage() が失敗にする。
  // ここでは、読み込みそのものが起きていることを確かめる
  await withPage(async (page) => {
    const types = new Set<string>();
    page.on("response", (res) => types.add(res.request().resourceType()));
    await login(page);
    assert.ok(types.has("script") && types.has("stylesheet"));
  });
});
