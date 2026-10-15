/**
 * ハッシュは `scrypt$N$r$p$ソルト$ハッシュ`（ソルトとハッシュは base64url）の形で保存する。
 * パラメータも一緒に保存しているため、PARAMS を強くしても既存のハッシュはそのまま検証できる。
 */
import { scrypt } from "node:crypto";
import { timingSafeEqual } from "./crypto.ts";

// OWASP が同等の強さとして挙げる組み合わせのうち、1 回のメモリが 32 MiB で済むもの。
// ログインが同時に来るとその分だけメモリを使うため、メモリの少ない組み合わせにしている
const PARAMS = { N: 2 ** 15, r: 8, p: 3 };
const KEY_LENGTH = 32;
const SALT_LENGTH = 16;

export const PASSWORD_MIN_LENGTH = 8;
/** 長い入力を重いハッシュにかけさせて CPU を使い切らせないため、これより長いものは検証しない。 */
export const PASSWORD_MAX_LENGTH = 128;

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_LENGTH));
  const key = await derive(password, salt, PARAMS);
  return ["scrypt", PARAMS.N, PARAMS.r, PARAMS.p, base64url(salt), base64url(key)].join("$");
}

/** hash の形式が不正な場合も false を返す。 */
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
): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
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

function base64url(bytes: Uint8Array): string {
  return bytes.toBase64({ alphabet: "base64url", omitPadding: true });
}
