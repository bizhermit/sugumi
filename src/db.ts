/**
 * スキーマを変えるときは MIGRATIONS の末尾に追加し、適用済みの要素は書き換えないこと。
 * どこまで適用したかは PRAGMA user_version に記録している。
 *
 * node:sqlite の API は同期的に動く。await を挟まずに読んで書けば、その間に他のリクエストの処理は割り込まない。
 */
import { DatabaseSync } from "node:sqlite";

// deno.json の permissions と Dockerfile で、data/ への読み書きを許可している
const DATA_DIR = new URL("../data/", import.meta.url);

const MIGRATIONS = [
  `
  CREATE TABLE accounts (
    id INTEGER PRIMARY KEY,
    username TEXT NOT NULL UNIQUE,
    display_name TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    failed_attempts INTEGER NOT NULL DEFAULT 0,
    locked_until INTEGER
  ) STRICT;

  CREATE TABLE sessions (
    token_hash TEXT PRIMARY KEY,
    account_id INTEGER NOT NULL REFERENCES accounts (id) ON DELETE CASCADE,
    created_at INTEGER NOT NULL,
    last_access_at INTEGER NOT NULL
  ) STRICT;
  CREATE INDEX sessions_account_id ON sessions (account_id);

  CREATE TABLE secrets (
    name TEXT PRIMARY KEY,
    value BLOB NOT NULL
  ) STRICT;
  `,
];

export const db = open();

function open(): DatabaseSync {
  Deno.mkdirSync(DATA_DIR, { recursive: true });
  const db = new DatabaseSync(decodeURIComponent(new URL("app.db", DATA_DIR).pathname));
  db.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;");
  const { user_version } = db.prepare("PRAGMA user_version").get() as { user_version: number };
  for (let version = user_version; version < MIGRATIONS.length; version++) {
    db.exec("BEGIN");
    try {
      db.exec(MIGRATIONS[version]);
      db.exec(`PRAGMA user_version = ${version + 1}`);
      db.exec("COMMIT");
    } catch (e) {
      db.exec("ROLLBACK");
      throw e;
    }
  }
  return db;
}

/** name の秘密の値を返す。まだなければ bytes バイトのランダムな値を作って保存する。 */
export function secret(name: string, bytes: number): Uint8Array<ArrayBuffer> {
  db.prepare("INSERT OR IGNORE INTO secrets (name, value) VALUES (?, ?)")
    .run(name, crypto.getRandomValues(new Uint8Array(bytes)));
  const row = db.prepare("SELECT value FROM secrets WHERE name = ?").get(name) as {
    value: Uint8Array;
  };
  return new Uint8Array(row.value);
}
