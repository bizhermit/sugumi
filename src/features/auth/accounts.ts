import { randomBytes } from "node:crypto";
import type { DataBase } from "../../lib/db.ts";
import type { LoginAccount } from "./login-account.ts";
import { hashPassword, PASSWORD_MAX_LENGTH, verifyPassword } from "./password.ts";

export const USERNAME_MAX_LENGTH = 64;

type AccountRow = {
  readonly id: number;
  readonly username: string;
  readonly display_name: string;
  readonly password_hash: string;
};

// アカウントが無いときも検証にかける用。
// 応答にかかる時間からアカウントの有無を見分けられないようにする。
const DUMMY_HASH = await hashPassword(randomBytes(16).toString("base64url"));

const selectAccountSql = `
SELECT
  id
, username
, display_name
, password_hash
FROM
  accounts
WHERE
  username = $1
`;

export async function authenticate(
  db: DataBase,
  username: string,
  password: string,
): Promise<LoginAccount | undefined> {
  const checkable = password.length <= PASSWORD_MAX_LENGTH;
  const { rows } = await db.query<AccountRow>(selectAccountSql, [username]);
  const row = rows[0];
  if (row == null) {
    if (checkable) {
      await verifyPassword(password, DUMMY_HASH);
    }
    return undefined;
  }
  if (!checkable || !(await verifyPassword(password, row.password_hash))) {
    return undefined;
  }
  return { id: row.id, username: row.username, displayName: row.display_name };
}

const insertAccountSql = `
INSERT INTO accounts (
  username
, display_name
, password_hash
) VALUES ($1, $2, $3)
RETURNING id
`;

export async function createAccount(
  db: DataBase,
  username: string,
  displayName: string,
  password: string,
): Promise<number> {
  const { rows } = await db.query<{ id: number }>(insertAccountSql, [
    username,
    displayName,
    await hashPassword(password),
  ]);
  const row = rows[0];
  if (row == null) {
    throw new Error("アカウントを作成できませんでした。");
  }
  return row.id;
}
