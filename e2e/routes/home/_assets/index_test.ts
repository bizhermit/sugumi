import assert from "node:assert/strict";
import type { Page } from "playwright";
import { path } from "../../../../src/web/url.ts";
import { login, withPage } from "../../../_support/browser.ts";

/** ホームのログアウトのボタンを押し、確認のダイアログに accept で答える。ダイアログの文言を返す。 */
async function logout(page: Page, accept: boolean) {
  const dialog = page.waitForEvent("dialog");
  // ダイアログに答えるまで click() が終わらないため、待たずにダイアログに答える
  const clicked = page.getByRole("button", { name: "ログアウト" }).click();
  const shown = await dialog;
  const message = shown.message();
  await (accept ? shown.accept() : shown.dismiss());
  await clicked;
  return message;
}

Deno.test("home/_assets: ログアウトの確認で取り消すと、ログインしたままにする", async () => {
  await withPage(async (page) => {
    await login(page);
    assert.equal(await logout(page, false), "ログアウトしますか？");
    await page.goto(path("/home"));
    assert.equal(new URL(page.url()).pathname, path("/home"));
  });
});

Deno.test("home/_assets: ログアウトの確認で OK すると、ログアウトする", async () => {
  await withPage(async (page) => {
    await login(page);
    await logout(page, true);
    await page.waitForURL(path("/login"));
    await page.goto(path("/home"));
    assert.equal(new URL(page.url()).pathname, path("/login"));
  });
});
