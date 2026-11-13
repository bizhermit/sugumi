import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";

/**
 * パスワードのハッシュ化。
 * ハッシュは `scrypt$N$r$p$ソルト$ハッシュ`（ソルトとハッシュはbase64url）の形で保存する。
 * パラメータも一緒に保存するので、PARAMSを強くしても既存のハッシュはそのまま検証できる。
 */

const PARAMS = { N: 2 ** 15, r: 8, p: 3 };
const KEY_LENGTH = 32;
const SALT_LENGTH = 16;

export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 128;

function derive(password: string, salt: Buffer, params: { N: number; r: number; p: number }): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    // 同じ文字でも符号化が違うと別のパスワードになるため、正規化してから計算する。
    scrypt(
      password.normalize("NFC"),
      salt,
      KEY_LENGTH,
      { ...params, maxmem: 256 * params.N * params.r },
      (err, key) => {
        if (err != null) {
          reject(err);
        } else {
          resolve(key);
        }
      },
    );
  });
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_LENGTH);
  const key = await derive(password, salt, PARAMS);
  return ["scrypt", PARAMS.N, PARAMS.r, PARAMS.p, salt.toString("base64url"), key.toString("base64url")].join("$");
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  const [scheme, n, r, p, salt, key] = hash.split("$");
  if (scheme !== "scrypt" || n == null || r == null || p == null || salt == null || key == null) {
    return false;
  }
  const expected = Buffer.from(key, "base64url");
  const actual = await derive(password, Buffer.from(salt, "base64url"), { N: Number(n), r: Number(r), p: Number(p) });
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
