/// <reference lib="dom" />

import assert from "node:assert/strict";
import { path } from "../../../../src/web/url.ts";
import { withPage } from "../../../_support/browser.ts";

Deno.test("login/_assets: ボタンでパスワードの表示と非表示を切り替えられる", async () => {
  await withPage(async (page) => {
    await page.goto(path("/login"));
    const password = page.getByLabel("パスワード", { exact: true });
    const toggle = page.getByRole("button", { name: "パスワードを表示" });
    await toggle.click();
    assert.equal(await password.getAttribute("type"), "text");
    assert.equal(await toggle.getAttribute("aria-pressed"), "true");
    await toggle.click();
    assert.equal(await password.getAttribute("type"), "password");
    assert.equal(await toggle.getAttribute("aria-pressed"), "false");
  });
});

Deno.test("login/_assets: パスワードを表示したまま送信すると、隠してから送信する", async () => {
  await withPage(async (page) => {
    await page.goto(path("/login"));
    await page.getByLabel("ユーザー名").fill("alice");
    await page.getByLabel("パスワード", { exact: true }).fill("password");
    await page.getByRole("button", { name: "パスワードを表示" }).click();
    const submitted = await page.evaluate(() => {
      // document に付けるので、フォーム要素に付いた _assets/index.ts のリスナーより後に呼ばれる。
      // 画面が移動しないよう、送信は取り消す。
      const state = new Promise<{ type: string; pressed: string | null }>((resolve) => {
        document.addEventListener("submit", (e) => {
          e.preventDefault();
          resolve({
            type: document.querySelector<HTMLInputElement>('input[name="password"]')!.type,
            pressed: document.querySelector("button[aria-pressed]")!.getAttribute("aria-pressed"),
          });
        }, { once: true });
      });
      document.querySelector("form")!.requestSubmit();
      return state;
    });
    assert.deepEqual(submitted, { type: "password", pressed: "false" });
  });
});
