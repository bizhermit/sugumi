/**
 * ハッシュは `scrypt$N$r$p$ソルト$ハッシュ`（ソルトとハッシュは base64url）の形で保存する。
 * パラメータも一緒に保存しているので、PARAMS を強くしても、既存のハッシュはそのまま検証できる。
 */
import { scrypt } from "node:crypto";
import { timingSafeEqual } from "../crypto.ts";

// OWASP が同じ強さとして挙げる組み合わせのうち、1 回に使うメモリが 32 MiB で済むもの。
// ログインが同時に来ると、その数だけメモリを使うので、メモリの少ない組み合わせを選んでいる。
const PARAMS = { N: 2 ** 15, r: 8, p: 3 };
const KEY_LENGTH = 32;
const SALT_LENGTH = 16;

export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 128;

/** DB に保存するパスワードのハッシュを返す。長さの検証は呼び出し側で済ませておく。 */
export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_LENGTH));
  const key = await derive(password, salt, PARAMS);
  return ["scrypt", PARAMS.N, PARAMS.r, PARAMS.p, base64url(salt), base64url(key)].join("$");
}

/** password が hashPassword() で作った hash と一致すれば true を返す。hash の形式が不正なときも false を返す。 */
export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  const [scheme, n, r, p, salt, key] = hash.split("$");
  if (scheme !== "scrypt" || key === undefined) return false;
  const params = { N: Number(n), r: Number(r), p: Number(p) };
  const actual = await derive(
    password,
    Uint8Array.fromBase64(salt, { alphabet: "base64url" }),
    params,
  );
  return timingSafeEqual(base64url(actual), key);
}

function derive(
  password: string,
  salt: Uint8Array,
  { N, r, p }: { N: number; r: number; p: number },
) {
  return new Promise<Uint8Array>((resolve, reject) => {
    scrypt(
      password.normalize("NFC"),
      salt,
      KEY_LENGTH,
      { N, r, p, maxmem: 256 * N * r },
      (e, key) => {
        if (e) reject(e);
        else resolve(key);
      },
    );
  });
}

function base64url(bytes: Uint8Array) {
  return bytes.toBase64({ alphabet: "base64url", omitPadding: true });
}
