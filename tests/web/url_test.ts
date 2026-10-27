import assert from "node:assert/strict";
import { appPathOf, mailtoUrl, path, type Query, safeUrl, telUrl } from "../../src/web/url.ts";

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

Deno.test("safeUrl: http・https の URL は正規化して返し、アプリ内のパスは appPathOf() と同じに返す", () => {
  assert.equal(safeUrl("https://example.com/a?b=1#c"), "https://example.com/a?b=1#c");
  assert.equal(safeUrl("HTTP://Example.com"), "http://example.com/");
  assert.equal(safeUrl(" https://example.com/a b"), "https://example.com/a%20b");
  assert.equal(safeUrl("/home?a=1#top"), "/home?a=1");
});

Deno.test("safeUrl: http・https 以外の URL や、サイトの外を指すパスは捨てる", () => {
  for (
    const value of [
      null,
      undefined,
      "",
      "javascript:alert(1)",
      "JavaScript:alert(1)",
      " javascript:alert(1)",
      "\tjava\nscript:alert(1)",
      "\x00javascript:alert(1)",
      "data:text/html,<script>alert(1)</script>",
      "vbscript:msgbox(1)",
      "file:///etc/passwd",
      "mailto:a@example.com",
      "home",
      "#top",
      "?a=1",
      "//evil.example/",
      "/\\evil.example/",
      "/.//evil.example/",
      "https://",
      "https://example.com@evil.example/",
      "https://user:pass@example.com/",
      "https://:pass@example.com/",
    ]
  ) {
    assert.equal(safeUrl(value), undefined, JSON.stringify(value));
  }
});

Deno.test("mailtoUrl: メールアドレスを mailto: の URL にし、ローカル部の記号はエンコードする", () => {
  assert.equal(mailtoUrl("a.b+tag@example.co.jp"), "mailto:a.b%2Btag@example.co.jp");
  assert.equal(mailtoUrl("a?cc=x&b#c%d@example.com"), "mailto:a%3Fcc%3Dx%26b%23c%25d@example.com");
  assert.equal(mailtoUrl(`${"a".repeat(64)}@example.com`), `mailto:${"a".repeat(64)}@example.com`);
  assert.equal(
    mailtoUrl(`a@${"b".repeat(63)}.${"c".repeat(63)}.${"d".repeat(63)}.${"e".repeat(60)}`)?.length,
    7 + 254,
  );
});

Deno.test("mailtoUrl: メールアドレスの形式でない値は捨てる", () => {
  for (
    const value of [
      null,
      undefined,
      "",
      "a",
      "@example.com",
      "a@",
      "a@@example.com",
      "a@b@example.com",
      "mailto:a@example.com",
      "a@example.com?cc=b@example.com",
      "a@example.com\nBcc: b@example.com",
      " a@example.com",
      "a b@example.com",
      "a@-example.com",
      "a@example-.com",
      "a@example..com",
      "a@example.com.",
      '"a"@example.com',
      "あ@example.com",
      "a@例え.jp",
      `${"a".repeat(65)}@example.com`,
      `a@${"b".repeat(63)}.${"c".repeat(63)}.${"d".repeat(63)}.${"e".repeat(61)}`,
      `a@${"b".repeat(64)}.com`,
    ]
  ) {
    assert.equal(mailtoUrl(value), undefined, JSON.stringify(value));
  }
});

Deno.test("telUrl: 電話番号を区切りを除いた tel: の URL にする", () => {
  assert.equal(telUrl("03-1234-5678"), "tel:0312345678");
  assert.equal(telUrl("(03) 1234 5678"), "tel:0312345678");
  assert.equal(telUrl("+81-3-1234-5678"), "tel:+81312345678");
  assert.equal(telUrl("110"), "tel:110");
  assert.equal(telUrl("+123456789012345"), "tel:+123456789012345");
  assert.equal(telUrl("123456789012345"), "tel:123456789012345");
});

Deno.test("telUrl: 電話番号の形式でない値は捨てる", () => {
  for (
    const value of [
      null,
      undefined,
      "",
      "+",
      "-",
      "()",
      "tel:0312345678",
      "03-1234-5678;ext=1",
      "03-1234-5678#",
      "*67 03-1234-5678",
      "03.1234.5678",
      "0312345678\n",
      "１２３",
      "81+312345678",
      "++81312345678",
      "+1234567890123456",
      "1234567890123456",
    ]
  ) {
    assert.equal(telUrl(value), undefined, JSON.stringify(value));
  }
});

Deno.test("path: パラメータとクエリをエンコードする", () => {
  assert.equal(
    path("/login", { query: { to: "/home?a=1", expired: null } }),
    "/login?to=%2Fhome%3Fa%3D1",
  );
});

// RoutePath にパラメータのあるルートがまだないので、型を外して渡す。
const userPath = path as unknown as (
  route: string,
  options?: { params?: Record<string, string | number>; query?: Query },
) => string;

Deno.test("path: パラメータはセグメントごとにエンコードし、呼ぶたびに渡した値を使う", () => {
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
