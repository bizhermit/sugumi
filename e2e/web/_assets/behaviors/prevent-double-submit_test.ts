/// <reference lib="dom" />

import assert from "node:assert/strict";
import type { Page } from "playwright";
import { path } from "../../../../src/web/url.ts";
import { withPage } from "../../../_support/browser.ts";

/**
 * ログイン画面で送信ボタンを 2 回続けて押す。
 * それぞれの送信を prevent-double-submit.ts が取り消したかどうかと、1 回目の後の aria-busy を返す。
 * 画面が移動しないよう、送信はそのたびに取り消す。
 * cancelOnForm なら、ページ独自の処理を想定して、フォーム要素に付けたリスナーで 1 回目の送信を取り消す。
 */
async function submitTwice(
  page: Page,
  { cancelOnForm = false } = {},
) {
  await page.goto(path("/login"));
  // 必須の欄が空だと、ブラウザが送信の前に止めてしまう。
  await page.getByLabel("ユーザー名").fill("alice");
  await page.getByLabel("パスワード", { exact: true }).fill("password");
  // 送信で画面の移動が始まると、Playwright の操作は移動が終わるまで待たされる。
  // そこで、送信の結果ではなく、submit イベントが取り消されたかどうかをページの中で確かめる。
  return await page.evaluate((cancelOnForm) => {
    const form = document.querySelector("form")!;
    const prevented: Array<boolean> = [];
    if (cancelOnForm) {
      form.addEventListener("submit", (e) => e.preventDefault(), { once: true });
    }
    // 同じ document に後から登録するので、読み込み時に登録された prevent-double-submit.ts のリスナーより後に呼ばれる。
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

Deno.test("prevent-double-submit: 送信中のフォームは、もう一度送信されない", async () => {
  await withPage(async (page) => {
    assert.deepEqual(await submitTwice(page), { prevented: [false, true], busy: "true" });
  });
});

Deno.test("prevent-double-submit: フォームのリスナーで取り消された送信では、送信中の状態にしない", async () => {
  await withPage(async (page) => {
    assert.deepEqual(await submitTwice(page, { cancelOnForm: true }), {
      prevented: [true, false],
      busy: null,
    });
  });
});

Deno.test("prevent-double-submit: 戻るボタンでキャッシュから表示したときは、また送信できる", async () => {
  await withPage(async (page) => {
    await page.goto(path("/login"));
    // Cache-Control: no-store のページは、ブラウザがキャッシュから復元しないことがあるので、pageshow イベントを直接発生させる。
    const busy = await page.evaluate(() => {
      const form = document.querySelector("form")!;
      form.setAttribute("aria-busy", "true");
      dispatchEvent(new PageTransitionEvent("pageshow", { persisted: true }));
      return form.getAttribute("aria-busy");
    });
    assert.equal(busy, null);
  });
});
