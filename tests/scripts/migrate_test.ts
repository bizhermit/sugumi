import assert from "node:assert/strict";
import { splitPassword } from "../../scripts/migrate.ts";

Deno.test("migrate: URL からパスワードを外し、デコードして返す", () => {
  assert.deepEqual(splitPassword("postgres://migrator:p%40ss@db:5432/app_test?sslmode=disable"), {
    status: "ok",
    url: "postgres://migrator@db:5432/app_test?sslmode=disable",
    password: "p@ss",
  });
});

Deno.test("migrate: パスワードの + は、空白にせずそのまま返す", () => {
  assert.deepEqual(splitPassword("postgres://migrator:a+b@db/app_test"), {
    status: "ok",
    url: "postgres://migrator@db/app_test",
    password: "a+b",
  });
});

Deno.test("migrate: パスワードのない URL は、そのまま返す", () => {
  assert.deepEqual(splitPassword("postgres://migrator@db:5432/app_test"), {
    status: "ok",
    url: "postgres://migrator@db:5432/app_test",
    password: undefined,
  });
});

Deno.test("migrate: postgres:// の URL として読めなければ invalid を返す", () => {
  for (
    const value of [
      "host=db user=migrator password=secret dbname=app",
      "postgres://migrator:secret@h1:5432,h2:5433/app",
      "https://migrator:secret@db/app",
      "postgres://migrator:50%off@db/app",
    ]
  ) {
    assert.deepEqual(splitPassword(value), { status: "invalid" }, value);
  }
});

Deno.test("migrate: クエリに書いたパスワードは受け付けず、invalid を返す", () => {
  for (
    const value of [
      "postgres://migrator@db/app?password=a+b",
      "postgres://migrator@db/app?sslmode=disable&pass%77ord=secret",
    ]
  ) {
    assert.deepEqual(splitPassword(value), { status: "invalid" }, value);
  }
});
