import assert from "node:assert/strict";
import { appPathOf, path, type Query } from "../../src/web/url.ts";

Deno.test("appPathOf: サイトの中のパスはクエリごと返し、フラグメントは捨てる", () => {
  assert.equal(appPathOf("/"), "/");
  assert.equal(appPathOf("/home?a=1&b=2#top"), "/home?a=1&b=2");
  assert.equal(appPathOf("/a/../home"), "/home");
});

Deno.test("appPathOf: サイトの外を指すパスやパスでない値は捨てる", () => {
  for (
    const value of [
      null,
      "",
      "home",
      "https://evil.example/",
      "//evil.example/",
      "/\\evil.example/",
      "/\t/evil.example/",
      "/.//evil.example/",
      "/a/../..//evil.example/",
    ]
  ) {
    assert.equal(appPathOf(value), undefined, JSON.stringify(value));
  }
});

Deno.test("path: パラメータとクエリをエンコードする", () => {
  assert.equal(
    path("/login", { query: { to: "/home?a=1", expired: null } }),
    "/login?to=%2Fhome%3Fa%3D1",
  );
});

// RoutePath にパラメータのあるルートがまだないため、型を外して渡す
const userPath = path as unknown as (
  route: string,
  options?: { params?: Record<string, string | number>; query?: Query },
) => string;

Deno.test("path: パラメータは区切りごとにエンコードし、呼ぶたびに渡した値を使う", () => {
  assert.equal(userPath("/user/[id]/edit", { params: { id: "a/b c" } }), "/user/a%2Fb%20c/edit");
  assert.equal(userPath("/user/[id]/edit", { params: { id: 2 } }), "/user/2/edit");
  for (const id of ["", ".", ".."]) {
    assert.throws(() => userPath("/user/[id]", { params: { id } }), /パラメータ "id"/, id);
  }
  assert.throws(() => userPath("/user/[id]", { params: {} }), /パラメータ "id"/);
});

Deno.test("path: クエリの配列は同じキーで繰り返し、null・undefined は省く", () => {
  assert.equal(path("/home"), "/home");
  assert.equal(path("/home", { query: {} }), "/home");
  assert.equal(path("/home", { query: { a: null, b: undefined, c: [] } }), "/home");
  assert.equal(
    path("/home", { query: { tag: ["x y", "&"], n: 0, on: false } }),
    "/home?tag=x+y&tag=%26&n=0&on=false",
  );
  assert.equal(path("/"), "/");
});
