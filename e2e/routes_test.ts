import assert from "node:assert/strict";
import type { Page } from "playwright";
import { GET_ROUTES, type RoutePath } from "../src/routes.gen.ts";
import { login, withPage } from "./_support/browser.ts";

// パラメータのあるルートは、開く URL をここに書く。書いていないとテストが失敗する。
const SAMPLE_URLS: Partial<Record<RoutePath, string>> = {};

/**
 * route を開き、成功のレスポンス（リダイレクト後を含む）が返ることと、そのレスポンスの CSP を確かめる。
 * CSP が緩むと違反そのものが起きなくなり、withPage() では気づけない。そのため、CSP の値も確かめる。
 * ページで CSP を緩めるときは、ここで認める範囲も見直す（外部のスクリプトについては CLAUDE.md の「ライブラリ」を参照）。
 */
async function open(page: Page, route: RoutePath) {
  const url = route.includes("[") ? SAMPLE_URLS[route] : route;
  assert.ok(url !== undefined, `${route}: SAMPLE_URLS に開く URL を書いてください`);
  const res = await page.goto(url);
  assert.ok(res !== null && res.ok(), `${route}: ${res?.status()}`);
  const csp = await res.headerValue("content-security-policy");
  assert.ok(csp !== null, `${route}: Content-Security-Policy がありません`);
  const directives = new Map(
    csp.split(";").map((directive) => {
      const [name, ...sources] = directive.trim().split(/\s+/);
      return [name, sources.join(" ")];
    }),
  );
  assert.equal(directives.get("script-src"), "'self'", `${route}: ${csp}`);
  assert.equal(directives.get("require-trusted-types-for"), "'script'", `${route}: ${csp}`);
  assert.ok(!csp.includes("'unsafe-"), `${route}: ${csp}`);
}

Deno.test("routes: ログインせずに、すべての画面を CSP の違反なく開ける", async (t) => {
  for (const route of GET_ROUTES) {
    await t.step(route, () => withPage((page) => open(page, route)));
  }
});

Deno.test("routes: ログインして、すべての画面を CSP の違反なく開ける", async (t) => {
  // GET でも状態が変わるルートがある（/login を開くとログアウトする）ので、ルートごとにログインし直す。
  for (const route of GET_ROUTES) {
    await t.step(route, () =>
      withPage(async (page) => {
        await login(page);
        await open(page, route);
      }));
  }
});

Deno.test("routes: 画面で JS と CSS が読み込まれる", async () => {
  // 読み込みに失敗したり止められたりしたときは、ブラウザがコンソールにエラーを出すので、withPage() が失敗にする。
  // ここでは、読み込み自体が行われていることを確かめる。
  await withPage(async (page) => {
    const types = new Set<string>();
    page.on("response", (res) => types.add(res.request().resourceType()));
    await login(page);
    assert.ok(types.has("script") && types.has("stylesheet"));
  });
});
