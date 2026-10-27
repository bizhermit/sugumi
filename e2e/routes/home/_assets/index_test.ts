import assert from "node:assert/strict";
import type { Page } from "playwright";
import { path } from "../../../../src/web/url.ts";
import { login, withPage } from "../../../_support/browser.ts";

/** ホームのログアウトボタンを押し、確認ダイアログで accept なら OK、そうでなければキャンセルを選ぶ。ダイアログの文言を返す。 */
async function logout(page: Page, accept: boolean) {
  const dialog = page.waitForEvent("dialog");
  // click() はダイアログに答えるまで終わらないので、await せずに先にダイアログに答える。
  const clicked = page.getByRole("button", { name: "ログアウト" }).click();
  const shown = await dialog;
  const message = shown.message();
  await (accept ? shown.accept() : shown.dismiss());
  await clicked;
  return message;
}

Deno.test("home/_assets: ログアウトの確認でキャンセルすると、ログインしたままになる", async () => {
  await withPage(async (page) => {
    await login(page);
    assert.equal(await logout(page, false), "ログアウトしますか？");
    await page.goto(path("/home"));
    assert.equal(new URL(page.url()).pathname, path("/home"));
  });
});

Deno.test("home/_assets: ログアウトの確認で OK を選ぶと、ログアウトする", async () => {
  await withPage(async (page) => {
    await login(page);
    await logout(page, true);
    await page.waitForURL(path("/login"));
    await page.goto(path("/home"));
    assert.equal(new URL(page.url()).pathname, path("/login"));
  });
});
