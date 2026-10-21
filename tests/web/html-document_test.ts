import assert from "node:assert/strict";
import { jsxTemplate } from "../../src/lib/jsx-runtime.ts";
import { composePage, type Title } from "../../src/web/html-document.tsx";
import { layoutsOf, loadRouter, type RouteContext } from "../../src/web/router.ts";
import { handler, layout, withFixture } from "../_support/routes.ts";

const ctx = {} as RouteContext;
const main = jsxTemplate(["page"]);

/** root の relative のディレクトリにあるページを、title で組み立てる。 */
async function compose(
  root: URL,
  relative: string,
  title?: Title,
  options: { aside?: boolean; layout?: false } = {},
): Promise<{ title: string; main: string }> {
  const page = new URL(`${relative}view.tsx`, root).href;
  const slots = options.aside ? { main, aside: jsxTemplate(["aside"]) } : { main };
  const result = await composePage(ctx, { title, slots, page, layout: options.layout });
  return { title: result.title, main: result.main.value };
}

Deno.test("layout: layout.tree.ts は配下に、layout.ts は置いたディレクトリだけに、外側から順に包む", async () => {
  await withFixture({
    "layout.tree.ts": layout("tree /", `"サイト"`),
    "get.ts": handler("GET /"),
    // a/ はルートでないディレクトリ
    "a/layout.tree.ts": layout("tree /a"),
    "a/b/layout.ts": layout("layout /a/b"),
    "a/b/get.ts": handler("GET /a/b"),
    "a/b/c/get.ts": handler("GET /a/b/c"),
  }, async (root) => {
    await loadRouter({ mock: false, root });
    assert.equal(layoutsOf(new URL("a/b/view.tsx", root).href).length, 3);
    assert.equal((await compose(root, "a/b/")).main, "[tree / [tree /a [layout /a/b page]]]");
    assert.equal((await compose(root, "a/b/c/")).main, "[tree / [tree /a page]]");
    assert.equal((await compose(root, "")).main, "[tree / page]");
    // layout: false なら包まない。タイトルも layout から受け取らない
    assert.deepEqual(await compose(root, "a/b/", "単独", { layout: false }), {
      title: "単独",
      main: "page",
    });
  });
});

Deno.test("layout: main 以外の slots は、間の layout が使わなくても外側の layout に届く", async () => {
  await withFixture({
    "layout.tree.ts": layout("outer", `"サイト"`),
    "a/layout.ts": layout("inner"),
    "a/get.ts": handler("GET /a"),
  }, async (root) => {
    await loadRouter({ mock: false, root });
    assert.equal(
      (await compose(root, "a/", undefined, { aside: true })).main,
      "[outer [inner page {aside}] {aside}]",
    );
  });
});

Deno.test("layout: タイトルは外側の layout から順に決め、最後にページの title を適用する", async () => {
  await withFixture({
    "layout.tree.ts": layout("outer", `"サイト"`),
    "get.ts": handler("GET /"),
    "admin/layout.tree.ts": layout("admin", `(t: string) => t + " - 管理"`),
    "admin/get.ts": handler("GET /admin"),
    "admin/users/get.ts": handler("GET /admin/users"),
  }, async (root) => {
    await loadRouter({ mock: false, root });
    assert.equal((await compose(root, "")).title, "サイト");
    assert.equal((await compose(root, "admin/")).title, "サイト - 管理");
    assert.equal(
      (await compose(root, "admin/users/", (t) => `ユーザー | ${t}`)).title,
      "ユーザー | サイト - 管理",
    );
    // 文字列は外側のタイトルを置き換える
    assert.equal((await compose(root, "admin/users/", "ユーザー")).title, "ユーザー");
  });
});

Deno.test("layout: タイトルが決まらないときと、外側のタイトルがないのに関数を渡したときは例外になる", async () => {
  await withFixture({
    "get.ts": handler("GET /"),
    "a/layout.ts": layout("a", `(t: string) => t + " - A"`),
    "a/get.ts": handler("GET /a"),
  }, async (root) => {
    await loadRouter({ mock: false, root });
    await assert.rejects(compose(root, ""), /タイトルが決まっていません/);
    await assert.rejects(compose(root, "", (t) => t), /外側の layout でタイトルが決まっていません/);
    await assert.rejects(compose(root, "a/", "A"), /外側の layout でタイトルが決まっていません/);
  });
});

Deno.test("layout: mock のときだけ layout.mock.ts を使う", async () => {
  await withFixture({
    "layout.ts": layout("real", `"本物"`),
    "layout.mock.ts": layout("mock", `"モック"`),
    "get.ts": handler("GET /"),
  }, async (root) => {
    await loadRouter({ mock: false, root });
    assert.deepEqual(await compose(root, ""), { title: "本物", main: "[real page]" });
    await loadRouter({ mock: true, root });
    assert.deepEqual(await compose(root, ""), { title: "モック", main: "[mock page]" });
  });
});

Deno.test("layout: default export が Layout の形でなければ、読み込むときに例外になる", async () => {
  for (
    const content of [
      `export default { title: "x" };`,
      `export default { title: 1, render: () => "" };`,
    ]
  ) {
    await withFixture({ "layout.ts": content, "get.ts": handler("GET /") }, async (root) => {
      await assert.rejects(loadRouter({ mock: false, root }), /Layout の形になっていません/);
    });
  }
});

Deno.test("layout: ルートでないディレクトリのページは例外になる", async () => {
  await withFixture({ "get.ts": handler("GET /"), "a/view.tsx": "" }, async (root) => {
    await loadRouter({ mock: false, root });
    assert.throws(
      () => layoutsOf(new URL("a/view.tsx", root).href),
      /ルートのディレクトリにありません/,
    );
  });
});
