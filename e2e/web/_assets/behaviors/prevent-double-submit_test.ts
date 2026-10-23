/// <reference lib="dom" />

import assert from "node:assert/strict";
import type { Page } from "playwright";
import { path } from "../../../../src/web/url.ts";
import { withPage } from "../../../_support/browser.ts";

/**
 * ログインの画面で、送信ボタンを 2 回続けて押す。
 * 送信ごとに、prevent-double-submit.ts が取り消したかどうかを返す。画面を移動しないよう、送信はすべて取り消す。
 * cancelOnForm なら、ページ側の処理として、フォーム要素に付けたリスナーで 1 回目の送信を取り消す。
 */
async function submitTwice(
  page: Page,
  { cancelOnForm = false } = {},
): Promise<{ prevented: boolean[]; busy: string | null }> {
  await page.goto(path("/login"));
  // 必須の欄が空だと、ブラウザが送信の前に止める
  await page.getByLabel("ユーザー名").fill("alice");
  await page.getByLabel("パスワード", { exact: true }).fill("password");
  // 送信による画面の移動が始まると、Playwright の操作は移動が終わるまで待つ。
  // 送信の結果ではなく、submit イベントが取り消されたかをページの中で確かめる
  return await page.evaluate((cancelOnForm) => {
    const form = document.querySelector("form")!;
    const prevented: boolean[] = [];
    if (cancelOnForm) {
      form.addEventListener("submit", (e) => e.preventDefault(), { once: true });
    }
    // 読み込み時に付いた prevent-double-submit.ts のリスナーより後に呼ばれる
    document.addEventListener("submit", (e) => {
      prevented.push(e.defaultPrevented);
      e.preventDefault();
    });
    const button = form.querySelector<HTMLButtonElement>('button[type="submit"]')!;
    button.click();
    const busy = form.getAttribute("aria-busy");
    button.click();
    return { prevented, busy };
  }, cancelOnForm);
}

Deno.test("prevent-double-submit: 送信中のフォームは、もう一度送信しない", async () => {
  await withPage(async (page) => {
    assert.deepEqual(await submitTwice(page), { prevented: [false, true], busy: "true" });
  });
});

Deno.test("prevent-double-submit: フォームのリスナーで取り消した送信は、送信中にしない", async () => {
  await withPage(async (page) => {
    assert.deepEqual(await submitTwice(page, { cancelOnForm: true }), {
      prevented: [true, false],
      busy: null,
    });
  });
});

Deno.test("prevent-double-submit: 戻るボタンでキャッシュから表示したら、また送信できる", async () => {
  await withPage(async (page) => {
    await page.goto(path("/login"));
    // Cache-Control: no-store のページは、ブラウザがキャッシュから戻さないことがあるため、イベントを直接送る
    const busy = await page.evaluate(() => {
      const form = document.querySelector("form")!;
      form.setAttribute("aria-busy", "true");
      dispatchEvent(new PageTransitionEvent("pageshow", { persisted: true }));
      return form.getAttribute("aria-busy");
    });
    assert.equal(busy, null);
  });
});
