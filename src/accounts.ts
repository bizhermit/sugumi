import { randomToken } from "./crypto.ts";
import { db } from "./db.ts";
import { LOGIN_LOCKOUT_MINUTES, LOGIN_MAX_FAILED_ATTEMPTS } from "./env.ts";
import {
  hashPassword,
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  verifyPassword,
} from "./password.ts";

const USERNAME_MAX_LENGTH = 64;
const SQLITE_CONSTRAINT_UNIQUE = 2067;

export type Account = { id: number; username: string; displayName: string };

export type AuthResult =
  | { status: "ok"; account: Account }
  /** locked はこの失敗でロックしたとき true。 */
  | { status: "wrong_password"; account: Account; locked: boolean }
  | { status: "locked"; account: Account }
  | { status: "unknown_user" };

type AccountRow = {
  id: number;
  username: string;
  display_name: string;
  password_hash: string;
  failed_attempts: number;
  locked_until: number | null;
};

if (LOGIN_MAX_FAILED_ATTEMPTS === 0) {
  console.warn("LOGIN_MAX_FAILED_ATTEMPTS が 0 のため、ログインの試行回数を制限していません");
}

// アカウントがないときもパスワードの検証と同じだけ時間をかけ、応答時間からアカウントの有無を見分けられないようにする
const DUMMY_HASH = await hashPassword(randomToken());

/** 呼び出し側は、どの失敗かを利用者に区別して見せないこと。アカウントの有無やロックの状態が分かってしまう。 */
export async function authenticate(username: string, password: string): Promise<AuthResult> {
  const row = db.prepare("SELECT * FROM accounts WHERE username = ?").get(username) as
    | AccountRow
    | undefined;
  const checkable = password.length <= PASSWORD_MAX_LENGTH;
  if (!row) {
    if (checkable) await verifyPassword(password, DUMMY_HASH);
    return { status: "unknown_user" };
  }
  const account = toAccount(row);
  const attempt = reserveAttempt(row.id, Date.now());
  const ok = checkable && await verifyPassword(password, row.password_hash);
  if (!attempt) return { status: "locked", account };
  if (!ok) return { status: "wrong_password", account, locked: attempt.locks };
  db.prepare("UPDATE accounts SET failed_attempts = 0, locked_until = NULL WHERE id = ?")
    .run(row.id);
  return { status: "ok", account };
}

/**
 * 検証の前に失敗として 1 回数え、ロック中なら undefined を返す。成功すると数え直す。
 * LOGIN_MAX_FAILED_ATTEMPTS が 0 なら数えず、それまでのロックも無視する。
 * 検証の後で数えると、検証中に並行して送られたリクエストが上限を超えて試せてしまうため。
 * 上限に達する回で先にロックするのは、検証中にプロセスが落ちてもロックが残るようにするため。
 */
function reserveAttempt(id: number, now: number): { locks: boolean } | undefined {
  if (LOGIN_MAX_FAILED_ATTEMPTS === 0) return { locks: false };
  const { failed_attempts, locked_until } = db
    .prepare("SELECT failed_attempts, locked_until FROM accounts WHERE id = ?")
    .get(id) as Pick<AccountRow, "failed_attempts" | "locked_until">;
  if (locked_until !== null && locked_until > now) return undefined;
  const attempts = (locked_until === null ? failed_attempts : 0) + 1;
  const locks = attempts >= LOGIN_MAX_FAILED_ATTEMPTS;
  db.prepare("UPDATE accounts SET failed_attempts = ?, locked_until = ? WHERE id = ?")
    .run(attempts, locks ? now + LOGIN_LOCKOUT_MINUTES * 60 * 1000 : null, id);
  return { locks };
}

export function findAccount(id: number): Account | undefined {
  const row = db.prepare("SELECT * FROM accounts WHERE id = ?").get(id) as AccountRow | undefined;
  return row && toAccount(row);
}

/** 入力が条件を満たさない場合や、ユーザー名が使われている場合は例外を投げる。 */
export async function createAccount(
  username: string,
  displayName: string,
  password: string,
): Promise<Account> {
  if (username === "" || username.length > USERNAME_MAX_LENGTH || /[\p{Cc}\s]/u.test(username)) {
    throw new Error(`ユーザー名は空白を含まない ${USERNAME_MAX_LENGTH} 文字以内にしてください`);
  }
  if (displayName.trim() === "") throw new Error("表示名を入力してください");
  if (password.length < PASSWORD_MIN_LENGTH || password.length > PASSWORD_MAX_LENGTH) {
    throw new Error(
      `パスワードは ${PASSWORD_MIN_LENGTH} 文字以上 ${PASSWORD_MAX_LENGTH} 文字以内にしてください`,
    );
  }
  const hash = await hashPassword(password);
  try {
    const row = db
      .prepare(
        "INSERT INTO accounts (username, display_name, password_hash) VALUES (?, ?, ?) RETURNING *",
      )
      .get(username, displayName, hash) as AccountRow;
    return toAccount(row);
  } catch (e) {
    if ((e as { errcode?: number }).errcode === SQLITE_CONSTRAINT_UNIQUE) {
      throw new Error(`ユーザー名 ${username} は使われています`);
    }
    throw e;
  }
}

function toAccount(row: AccountRow): Account {
  return { id: row.id, username: row.username, displayName: row.display_name };
}
