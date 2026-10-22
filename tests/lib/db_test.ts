import assert from "node:assert/strict";
import { db, isDbTimeout, secret, transaction } from "../../src/lib/db.ts";
import {
  DB_CONNECTION_TIMEOUT_SECONDS,
  DB_POOL_MAX,
  DB_STATEMENT_TIMEOUT_SECONDS,
} from "../../src/lib/env.ts";
import { resetDb } from "../_support/db.ts";

async function usernames(): Promise<string[]> {
  const { rows } = await db.query<{ username: string }>("SELECT username FROM accounts");
  return rows.map((r) => r.username);
}

function insert(client: { query: typeof db.query }, username: string) {
  return client.query(
    "INSERT INTO accounts (username, display_name, password_hash) VALUES ($1, $1, 'x')",
    [username],
  );
}

Deno.test("db: transaction は fn の結果を返し、書き込みを確定する", async () => {
  await resetDb();
  const result = await transaction(async (client) => {
    await insert(client, "alice");
    return 42;
  });
  assert.equal(result, 42);
  assert.deepEqual(await usernames(), ["alice"]);
});

Deno.test("db: transaction は fn が例外を投げたら ROLLBACK し、例外を投げ直す", async () => {
  await resetDb();
  await assert.rejects(
    transaction(async (client) => {
      await insert(client, "alice");
      throw new Error("途中で失敗");
    }),
    /途中で失敗/,
  );
  // SQL の失敗でも同じく戻し、接続は次の問い合わせに使える
  await assert.rejects(
    transaction(async (client) => {
      await insert(client, "bob");
      await insert(client, "bob");
    }),
    /duplicate key/,
  );
  assert.deepEqual(await usernames(), []);
  await transaction((client) => insert(client, "carol"));
  assert.deepEqual(await usernames(), ["carol"]);
});

Deno.test("db: secret は最初に作った値を返し続ける", async () => {
  const name = `test_${crypto.randomUUID()}`;
  try {
    const [a, b] = await Promise.all([secret(name, 32), secret(name, 32)]);
    assert.equal(a.length, 32);
    assert.deepEqual(a, b);
    assert.deepEqual(await secret(name, 16), a);
  } finally {
    await db.query("DELETE FROM secrets WHERE name = $1", [name]);
  }
});

Deno.test("db: Pool の大きさと時間制限は env.ts の値にする", async () => {
  assert.equal(db.options.max, DB_POOL_MAX);
  assert.equal(db.options.connectionTimeoutMillis, DB_CONNECTION_TIMEOUT_SECONDS * 1000);
  // current_setting() は 60 秒を 1min のように単位を変えて返すため、ミリ秒の値で比べる
  const { rows } = await db.query<{ setting: string }>(
    "SELECT setting FROM pg_settings WHERE name = 'statement_timeout'",
  );
  assert.equal(Number(rows[0].setting), DB_STATEMENT_TIMEOUT_SECONDS * 1000);
});

Deno.test("db: isDbTimeout は、問い合わせの時間制限で止まった例外を見分ける", async () => {
  // DB_STATEMENT_TIMEOUT_SECONDS を待たずに確かめるため、このトランザクションだけ短くする
  await assert.rejects(
    transaction(async (client) => {
      await client.query("SET LOCAL statement_timeout = 10");
      await client.query("SELECT pg_sleep(1)");
    }),
    (e) => isDbTimeout(e),
  );
  assert.equal(isDbTimeout(new Error("x")), false);
  assert.equal(isDbTimeout("timeout"), false);
});
