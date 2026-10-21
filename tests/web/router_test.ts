import assert from "node:assert/strict";
import { loadRouter, type RouteContext, scanRoutes } from "../../src/web/router.ts";
import { before, calls, handler, withFixture } from "../_support/routes.ts";

async function call(
  match: Awaited<ReturnType<typeof loadRouter>>,
  pathname: string,
  method: string,
  init?: RequestInit,
): Promise<string | undefined> {
  const found = match(pathname, method);
  if (!found?.handler) return undefined;
  const ctx = { route: found.route, params: found.params } as RouteContext;
  const res = await found.handler(
    new Request(`http://localhost${pathname}`, { method, ...init }),
    ctx,
  );
  return await res.text();
}

Deno.test("router: メソッドのファイルに振り分け、パラメータを渡す", async () => {
  await withFixture({
    "get.ts": handler("GET /"),
    "post.ts": handler("POST /"),
    "foo/get.tsx": handler("GET /foo"),
    "user/[id]/get.ts": handler("GET /user/[id]"),
    "user/new/get.ts": handler("GET /user/new"),
  }, async (root) => {
    const match = await loadRouter({ mock: false, root });
    assert.equal(await call(match, "/", "GET"), "GET /");
    assert.equal(await call(match, "/", "POST"), "POST /");
    assert.equal(await call(match, "/foo", "GET"), "GET /foo");
    // 静的なルートを動的なルートより優先する
    assert.equal(await call(match, "/user/new", "GET"), "GET /user/new");
    const user = match("/user/a%2Fb", "GET");
    assert.equal(user?.route, "/user/[id]");
    assert.deepEqual(user?.params, { id: "a/b" });
    // `/%61dmin` のようなエンコードも、デコードしてから照合する
    assert.equal(match("/%66oo", "GET")?.route, "/foo");
    assert.equal(match("/bar", "GET"), undefined);
    assert.equal(match("/user/", "GET"), undefined);
    assert.equal(match("/%E0", "GET"), undefined);
  });
});

Deno.test("router: %2F を区切りとして扱わず、制御文字や不正なエンコードを含むものには照合しない", async () => {
  await withFixture({
    "get.ts": handler("GET /"),
    "foo/bar/get.ts": handler("GET /foo/bar"),
    "a/[x]/c/get.ts": handler("GET /a/[x]/c"),
    "a/b/[y]/get.ts": handler("GET /a/b/[y]"),
  }, async (root) => {
    const match = await loadRouter({ mock: false, root });
    assert.equal(match("/foo/bar", "GET")?.route, "/foo/bar");
    assert.equal(match("/foo%2Fbar", "GET"), undefined);
    assert.equal(match("/foo/bar/", "GET"), undefined);
    for (
      const pathname of ["/foo%00/bar", "/foo/bar%0A", "/foo%7F/bar", "/foo/%C2%85", "/foo/%ZZ"]
    ) {
      assert.equal(match(pathname, "GET"), undefined, pathname);
    }
    // 表のキーは区切りを \0 でつなぐため、\0 を含む区切りを通すと /foo/bar と同じキーになる
    assert.equal(match("/foo%00bar", "GET"), undefined);
    assert.equal(match("/a/%00/c", "GET"), undefined);
    assert.equal(match("/a/b/%0A", "GET"), undefined);
    // 区切りの数が同じ動的なルートでは、前の区切りが固定のものを優先する
    assert.deepEqual(match("/a/b/c", "GET")?.route, "/a/b/[y]");
    assert.deepEqual(match("/a/z/c", "GET")?.params, { x: "z" });
    assert.equal(match("/a/z", "GET"), undefined);
  });
});

Deno.test("router: ファイルのないメソッドは handler がなく、Allow に使うメソッドを返す", async () => {
  await withFixture({
    "before.tree.ts": before("before.tree"),
    "get.ts": handler("GET /"),
    "delete.ts": handler("DELETE /"),
    "form/post.ts": handler("POST /form"),
  }, async (root) => {
    const match = await loadRouter({ mock: false, root });
    const root405 = match("/", "PUT");
    assert.equal(root405?.handler, undefined);
    assert.deepEqual(root405?.allow, ["DELETE", "GET", "HEAD"]);
    const form405 = match("/form", "GET");
    assert.equal(form405?.handler, undefined);
    assert.deepEqual(form405?.allow, ["POST"]);
    // 405 のときは before も呼ばない
    assert.deepEqual(calls, []);
  });
});

Deno.test("router: HEAD は get.ts で処理する", async () => {
  await withFixture({ "get.ts": handler("GET /") }, async (root) => {
    const match = await loadRouter({ mock: false, root });
    assert.equal(await call(match, "/", "HEAD"), "GET /");
  });
});

Deno.test("router: before.tree.ts を routes/ に近いものから順に呼び、最後に before.ts を呼ぶ", async () => {
  await withFixture({
    "before.tree.ts": before("tree /"),
    "before.ts": before("before /"),
    "get.ts": handler("GET /"),
    // a/ はルートでないディレクトリ
    "a/before.tree.ts": before("tree /a"),
    "a/b/before.tree.ts": before("tree /a/b"),
    "a/b/before.ts": before("before /a/b"),
    "a/b/get.ts": handler("GET /a/b"),
    "a/b/c/get.ts": handler("GET /a/b/c"),
  }, async (root) => {
    const match = await loadRouter({ mock: false, root });
    await call(match, "/a/b", "GET");
    assert.deepEqual(calls, ["tree /", "tree /a", "tree /a/b", "before /a/b", "GET /a/b"]);
    calls.length = 0;
    // before.ts は置いたディレクトリだけに適用する
    await call(match, "/a/b/c", "GET");
    assert.deepEqual(calls, ["tree /", "tree /a", "tree /a/b", "GET /a/b/c"]);
    calls.length = 0;
    await call(match, "/", "GET");
    assert.deepEqual(calls, ["tree /", "before /", "GET /"]);
  });
});

Deno.test("router: before が Response を返すと、それを応答にして後の処理を呼ばない", async () => {
  await withFixture({
    "before.tree.ts": `export default (req: Request) => {
      (globalThis as unknown as { calls: string[] }).calls.push("tree");
      return req.headers.has("x-stop") ? new Response("stopped") : undefined;
    };`,
    "before.ts": before("before"),
    "get.ts": handler("GET /"),
  }, async (root) => {
    const match = await loadRouter({ mock: false, root });
    assert.equal(await call(match, "/", "GET", { headers: { "x-stop": "1" } }), "stopped");
    assert.deepEqual(calls, ["tree"]);
  });
});

Deno.test("router: mock のときだけ *.mock.* を使う", async () => {
  await withFixture({
    "before.ts": before("before"),
    "before.mock.ts": before("before.mock"),
    "get.ts": handler("GET"),
    "get.mock.ts": handler("GET.mock"),
    "post.ts": handler("POST"),
  }, async (root) => {
    const real = await loadRouter({ mock: false, root });
    assert.equal(await call(real, "/", "GET"), "GET");
    assert.deepEqual(calls, ["before", "GET"]);
    calls.length = 0;
    const mock = await loadRouter({ mock: true, root });
    assert.equal(await call(mock, "/", "GET"), "GET.mock");
    assert.deepEqual(calls, ["before.mock", "GET.mock"]);
    // .mock のないファイルはそのまま使う
    assert.equal(await call(mock, "/", "POST"), "POST");
  });
});

Deno.test("router: 付けないファイルのない *.mock.* は、mock の指定によらず例外になる", async () => {
  await withFixture({
    "get.ts": handler("GET"),
    "post.mock.ts": handler("POST.mock"),
  }, async (root) => {
    for (const mock of [false, true]) {
      await assert.rejects(
        scanRoutes({ mock, root }),
        /post\.mock\.ts: 同じディレクトリに post\.ts・post\.tsx がありません/,
      );
    }
  });
});

Deno.test("router: 不正なファイル名・ディレクトリ名は例外になる", async (t) => {
  const cases: [string, Record<string, string>, RegExp][] = [
    [
      "大文字の名前",
      { "get.ts": handler("GET"), "Before.ts": before("b") },
      /Before\.ts: 名前は小文字/,
    ],
    [
      "違う拡張子",
      { "get.ts": handler("GET"), "before.jsx": before("b") },
      /before\.jsx: 名前は小文字/,
    ],
    [
      "同じ名前の .ts と .tsx",
      { "get.ts": handler("a"), "get.tsx": handler("b") },
      /get\.ts と get\.tsx の両方/,
    ],
    [
      "メソッドのファイルのない before.ts",
      { "a/before.ts": before("b") },
      /a\/before\.ts: 同じディレクトリにメソッドのファイルがありません/,
    ],
    [
      "メソッドのファイルのない layout.ts",
      { "a/layout.ts": "" },
      /a\/layout\.ts: 同じディレクトリにメソッドのファイルがありません/,
    ],
    [
      "パラメータでない [ ]",
      { "[a-b]/get.ts": handler("GET") },
      /"\[a-b\]" はパスの名前に使えません/,
    ],
    [
      "パラメータの重複",
      { "[id]/[id]/get.ts": handler("GET") },
      /パラメータ "id" が重複しています/,
    ],
    [
      "同じ URL のルート",
      { "[a]/get.ts": handler("a"), "[b]/get.ts": handler("b") },
      /と同じ URL に対応しています/,
    ],
    ["routes/assets/", { "assets/get.ts": handler("GET") }, /assets はページの URL に使えません/],
  ];
  for (const [name, files, error] of cases) {
    await t.step(name, async () => {
      await withFixture(files, async (root) => {
        await assert.rejects(scanRoutes({ root }), error);
      });
    });
  }
});

Deno.test("router: `_` や `.` で始まるディレクトリと、メソッドのファイル以外の名前はルートにしない", async () => {
  await withFixture({
    "get.ts": handler("GET"),
    "view.tsx": "",
    "_assets/get.ts": handler("_assets"),
    ".hidden/get.ts": handler(".hidden"),
  }, async (root) => {
    const routes = await scanRoutes({ root });
    assert.deepEqual(routes.map((r) => [r.relative, r.methods]), [["", ["get.ts"]]]);
  });
});
