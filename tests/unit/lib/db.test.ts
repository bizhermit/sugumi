import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { transaction, type DataBase } from "../../../src/lib/db.ts";

function fakeDb(failingQueries: readonly string[]) {
  const queries: string[] = [];
  const released: unknown[] = [];
  const client = {
    query: (sql: string) => {
      queries.push(sql);
      return failingQueries.includes(sql) ? Promise.reject(new Error(`fail: ${sql}`)) : Promise.resolve();
    },
    release: (err?: unknown) => {
      released.push(err);
    },
  };
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion
  const db = { connect: () => Promise.resolve(client) } as unknown as DataBase;
  return { db, queries, released };
}

describe("transaction", () => {
  it("成功したらCOMMITして接続をプールに戻す", async () => {
    const { db, queries, released } = fakeDb([]);
    assert.equal(await transaction(db, () => Promise.resolve(1)), 1);
    assert.deepEqual(queries, ["BEGIN", "COMMIT"]);
    assert.deepEqual(released, [undefined]);
  });

  it("失敗したらROLLBACKして元の例外を投げ、接続をプールに戻す", async () => {
    const { db, queries, released } = fakeDb([]);
    const original = new Error("original");
    await assert.rejects(
      transaction(db, () => Promise.reject(original)),
      original,
    );
    assert.deepEqual(queries, ["BEGIN", "ROLLBACK"]);
    assert.deepEqual(released, [undefined]);
  });

  it("ROLLBACKにも失敗したら元の例外を投げ、接続を捨てる", async () => {
    const { db, released } = fakeDb(["ROLLBACK"]);
    const original = new Error("original");
    await assert.rejects(
      transaction(db, () => Promise.reject(original)),
      original,
    );
    assert.deepEqual(released, [true]);
  });
});
