import { Pool, type PoolClient } from "pg";
import type { Logger } from "./logger.ts";

export type DataBase = Pool;

const CONNECTION_TIMEOUT_MS = 5_000;
const STATEMENT_TIMEOUT_MS = 30_000;

export function createDb(databaseUrl: string, logger: Logger): DataBase {
  const db = new Pool({
    connectionString: databaseUrl,
    connectionTimeoutMillis: CONNECTION_TIMEOUT_MS,
    statement_timeout: STATEMENT_TIMEOUT_MS,
  });
  db.on("error", (err) => {
    logger.error("DB接続が切れました。", { err });
  });
  return db;
}

export async function transaction<T>(db: DataBase, fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await db.connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}
