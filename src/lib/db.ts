import { Pool } from "pg";
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
