import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { createDb } from "../../src/lib/db.ts";
import { createTestLogger } from "./helpers/logger.ts";
import { startTestServer, type TestServer } from "./helpers/server.ts";

describe("i18n", () => {
  let server: TestServer;

  before(async () => {
    // DBを使用しないため繋がらないURLを使用する
    server = await startTestServer(createDb("postgres://localhost/unused", createTestLogger()));
  });

  after(async () => {
    await server.close();
  });

  async function loginPage(headers: Record<string, string>): Promise<string> {
    const res = await fetch(`${server.baseUrl}/login`, { headers });
    assert.equal(res.status, 200);
    return await res.text();
  }

  it("言語の指定がなければ既定の言語で表示する", async () => {
    const html = await loginPage({});
    assert.match(html, /<html lang="ja"/);
    assert.match(html, /<h1>ログイン<\/h1>/);
  });

  it("Accept-Languageの言語で表示する", async () => {
    const html = await loginPage({ "accept-language": "en-US,en;q=0.9,ja;q=0.8" });
    assert.match(html, /<html lang="en"/);
    assert.match(html, /<h1>Log in<\/h1>/);
  });

  it("CookieをAccept-Languageより優先する", async () => {
    const html = await loginPage({ "accept-language": "en", cookie: "__Host-lang=ja" });
    assert.match(html, /<html lang="ja"/);
  });

  it("対応していない言語のCookieは無視する", async () => {
    const html = await loginPage({ "accept-language": "en", cookie: "__Host-lang=fr" });
    assert.match(html, /<html lang="en"/);
  });

  it("レイアウトが指定した言語リソースを、表示している言語で配信する", async () => {
    const html = await loginPage({ "accept-language": "en" });
    const urls = [...html.matchAll(/<meta name="i18n" content="([^"]*)"/g)].map((match) => match[1] ?? "");
    assert.deepEqual(
      urls.map((url) => url.replace(/\?v=\w+$/, "")),
      ["/_assets/locales/en.json", "/_assets/locales/en.auth.json", "/_assets/locales/en.form.json"],
    );
    const bodies = await Promise.all(
      urls.map(async (url) => {
        const res = await fetch(`${server.baseUrl}${url}`);
        assert.equal(res.headers.get("content-type"), "application/json; charset=utf-8");
        assert.match(res.headers.get("cache-control") ?? "", /immutable/);
        return await res.text();
      }),
    );
    assert.match(bodies[0] ?? "", /"string\.required":"\{\{label\}\} is required"/);
    assert.match(bodies[1] ?? "", /"auth\.login\.title":"Log in"/);
  });
});
