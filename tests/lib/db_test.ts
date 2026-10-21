import assert from "node:assert/strict";
import { db, secret, transaction } from "../../src/lib/db.ts";
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
