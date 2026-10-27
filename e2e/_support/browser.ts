/**
 * ブラウザで画面を動かすテストの部品。
 * 接続先のアプリとログインに使うアカウントは、環境変数 E2E_BASE_URL・E2E_USERNAME・E2E_PASSWORD で受け取る。
 * これらは、ルートの deno task test:e2e がテスト用の DB でアプリを起動し、アカウントを作ってから渡す。
 */
import assert from "node:assert/strict";
import { type Browser, chromium, type Page } from "playwright";
import { path } from "../../src/web/url.ts";

const BASE_URL = required("E2E_BASE_URL");
export const USERNAME = required("E2E_USERNAME");
export const PASSWORD = required("E2E_PASSWORD");

// ブラウザは起動に時間がかかるので、テストのファイルごとに 1 つを使い回す。
// テストどうしは、withPage() がコンテキスト（Cookie などの保存先）を分けることで切り離す。
let browser: Promise<Browser> | undefined;

/**
 * 新しいコンテキストでページを開き、fn に渡す。baseURL を設定しているので、page.goto() などには path() の値をそのまま渡せる。
 * fn が終わったら、コンソールのエラーも、ページで捕まえていない例外も出ていないことを確かめる。
 * CSP や Trusted Types で止められた処理は、ブラウザがコンソールのエラーか例外として出すので、ここで検出できる。
 */
export async function withPage(fn: (page: Page) => Promise<void>): Promise<void> {
  browser ??= chromium.launch();
  const context = await (await browser).newContext({ baseURL: BASE_URL });
  try {
    const page = await context.newPage();
    const errors: Array<string> = [];
    page.on("console", (message) => {
      if (message.type() === "error") {
        errors.push(`${page.url()}: ${message.text()}`);
      }
    });
    page.on("pageerror", (error) => errors.push(`${page.url()}: ${error.message}`));
    await fn(page);
    assert.deepEqual(errors, []);
  } finally {
    await context.close();
  }
}

/** ログイン画面から E2E_USERNAME のアカウントでログインし、ホームが開くまで待つ。 */
export async function login(page: Page): Promise<void> {
  await page.goto(path("/login"));
  await page.getByLabel("ユーザー名").fill(USERNAME);
  await page.getByLabel("パスワード", { exact: true }).fill(PASSWORD);
  await page.getByRole("button", { name: "ログイン" }).click();
  await page.waitForURL(path("/home"));
}

function required(name: string) {
  const value = Deno.env.get(name);
  if (!value) {
    throw new Error(
      `環境変数 ${name} が設定されていません。ルートのディレクトリで deno task test:e2e を実行してください`,
    );
  }
  return value;
}
