import assert from "node:assert/strict";
import { appPathOf, path } from "../../src/web/url.ts";

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
