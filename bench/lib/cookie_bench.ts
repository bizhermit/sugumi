import { readCookie } from "../../src/lib/cookie.ts";

// 解析ツールなど、ほかの Cookie も付いたリクエストを想定する
const req = new Request("http://localhost/", {
  headers: {
    cookie: "_ga=GA1.1.123456789.1700000000; _ga_X=GS1.1.1700000000.1.1.1700000000.0.0.0; " +
      "theme=dark; __Host-csrf=1700000000000.abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQ; " +
      "__Host-sid=abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQ",
  },
});

// 1 リクエストで読む回数（セッション・CSRF・期限切れの判定）に合わせる
Deno.bench("readCookie() 3 回", () => {
  readCookie(req, "__Host-sid");
  readCookie(req, "__Host-csrf");
  readCookie(req, "__Host-sid");
});
